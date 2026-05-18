import cron from "node-cron";
import type { FastifyInstance } from "fastify";
import { notify } from "./notification.service.js";
import { writeAudit } from "../lib/audit.js";
import { escalationHtml } from "../lib/email.js";

// Deep-link target for escalation recipients. Normalize once to avoid double-slash.
const APP_URL = (process.env.APP_URL ?? "http://localhost:8080").replace(/\/+$/, "");

// BRD §5.3 — rule-based escalations.
// Hourly tick scans active rules and creates EscalationEvent + Notification records.
// Levels: 1 = manager, 2 = skip-level, 3 = HR (any Admin).

// Module-level singleton — `tsx watch` restarts the process but if it ever
// re-imports without restarting (HMR-style), this prevents duplicate ticks
// from piling up. We also expose a stop hook for tests / graceful shutdown.
let scheduledTask: cron.ScheduledTask | null = null;

export function startEscalationCron(app: FastifyInstance) {
  if (scheduledTask) {
    scheduledTask.stop();
    scheduledTask = null;
    app.log.info("[escalation] previous cron stopped before re-scheduling");
  }
  // Every hour at minute 5 — staggered so it doesn't collide with check-in spikes.
  scheduledTask = cron.schedule("5 * * * *", async () => {
    try {
      await tickEscalations(app);
    } catch (err) {
      app.log.error({ err }, "[escalation] tick failed");
    }
  });
  app.log.info("[escalation] cron started (hourly @ :05)");
}

export function stopEscalationCron() {
  if (scheduledTask) {
    scheduledTask.stop();
    scheduledTask = null;
  }
}

export async function tickEscalations(app: FastifyInstance) {
  const { prisma } = app;
  const rules = await prisma.escalationRule.findMany({ where: { enabled: true } });
  if (!rules.length) return;

  const now = new Date();

  for (const rule of rules) {
    const thresholdMs = rule.thresholdDays * 24 * 60 * 60 * 1000;
    const cutoff = new Date(now.getTime() - thresholdMs);

    if (rule.trigger === "GOAL_NOT_SUBMITTED") {
      const employees = await prisma.user.findMany({
        where: { role: "EMPLOYEE", goals: { none: { approvalStatus: { in: ["PENDING", "APPROVED"] } } }, createdAt: { lte: cutoff } },
        include: { manager: true },
      });
      for (const emp of employees) {
        await raiseEscalation(app, rule, emp.id, emp.manager?.id);
      }
    }

    if (rule.trigger === "APPROVAL_PENDING") {
      const stale = await prisma.goal.findMany({
        where: { approvalStatus: "PENDING", submittedAt: { lte: cutoff } },
        include: { owner: { include: { manager: true } } },
      });
      for (const g of stale) {
        if (g.owner.manager) {
          await raiseEscalation(app, rule, g.owner.manager.id);
        }
      }
    }

    if (rule.trigger === "CHECKIN_INCOMPLETE") {
      const activeCycle = await prisma.cycle.findFirst({
        where: { status: "ACTIVE", kind: { in: ["Q1", "Q2", "Q3", "Q4"] } },
      });
      if (!activeCycle) continue;
      // Quarter mismatch protection
      const quarter = activeCycle.kind as "Q1" | "Q2" | "Q3" | "Q4";
      const cycleWindowOpenedAt = activeCycle.openDate;
      if (cycleWindowOpenedAt > cutoff) continue;

      const employees = await prisma.user.findMany({
        where: { role: "EMPLOYEE" },
        include: { manager: true, goals: { include: { quarters: { where: { quarter } } } } },
      });
      for (const emp of employees) {
        const hasGap = emp.goals.some((g) => !g.quarters[0] || g.quarters[0].actual === null);
        if (hasGap) {
          await raiseEscalation(app, rule, emp.id, emp.manager?.id);
        }
      }
    }
  }
}

async function raiseEscalation(
  app: FastifyInstance,
  rule: { id: string; name: string; trigger: string; thresholdDays: number },
  targetId: string,
  managerId?: string | null,
) {
  const { prisma } = app;

  // Dedupe contract: an existing unresolved event for this rule+target acts as the
  // anchor. We only create a new event when its age crosses the next threshold band
  // (2× → L2 skip-level, 3× → L3 admin/HR). Otherwise we `return` without writing —
  // this prevents the hourly cron from spamming the same level repeatedly while the
  // underlying condition remains unresolved. Once an admin marks the prior event
  // resolved the chain restarts at L1 on the next tick.
  const recent = await prisma.escalationEvent.findFirst({
    where: { ruleId: rule.id, targetId, resolved: false },
    orderBy: { createdAt: "desc" },
  });

  // Determine escalation level
  let level = 1;
  let escalatedToId: string | null = managerId ?? null;
  const oneDayMs = 24 * 60 * 60 * 1000;

  if (recent) {
    const ageDays = (Date.now() - recent.createdAt.getTime()) / oneDayMs;
    if (ageDays >= rule.thresholdDays * 3) {
      level = 3;
      const hr = await prisma.user.findFirst({ where: { role: "ADMIN" } });
      escalatedToId = hr?.id ?? escalatedToId;
    } else if (ageDays >= rule.thresholdDays * 2) {
      level = 2;
      if (managerId) {
        const skip = await prisma.user.findUnique({ where: { id: managerId }, include: { manager: true } });
        escalatedToId = skip?.manager?.id ?? escalatedToId;
      }
    } else {
      // Still within the current threshold band — dedupe and skip creation.
      return;
    }
  }

  // Fallback chain: if no manager / skip-level resolved at this level, escalate to any ADMIN
  // so escalations never silently disappear. Per BRD §5.3 the L3 fallback is HR / Admin.
  if (!escalatedToId) {
    const admin = await prisma.user.findFirst({ where: { role: "ADMIN" } });
    if (admin) {
      escalatedToId = admin.id;
      level = Math.max(level, 3);
    } else {
      app.log.warn({ rule: rule.name, targetId }, "[escalation] no manager and no admin — dropping");
      return;
    }
  }

  const target = await prisma.user.findUnique({ where: { id: targetId } });
  if (!target) return;

  // BRD §5.3 — fetch recipient details so we can include them in email +
  // Teams card. Email goes to the user's mailbox (skipped if absent).
  const escalatedTo = await prisma.user.findUnique({ where: { id: escalatedToId } });

  await prisma.escalationEvent.create({
    data: {
      ruleId: rule.id,
      targetId,
      escalatedToId,
      level,
      reason: `${rule.name} — Level ${level}`,
    },
  });

  const reasonText = `${rule.name} — ${target.name} (${rule.trigger}) at level ${level}`;
  const link = `${APP_URL}/admin/escalations`;
  await notify(prisma, {
    userId: escalatedToId,
    type: "ESCALATION",
    message: `Escalation (L${level}): ${rule.name} — ${target.name} (${rule.trigger})`,
    link,
    // BRD §5.3 — fan out email + Teams card on every escalation.
    // Email is skipped if recipient has no email on file.
    email: escalatedTo?.email
      ? {
          to: escalatedTo.email,
          subject: `Escalation L${level} — ${target.name}`,
          html: escalationHtml({
            recipientName: escalatedTo.name,
            level,
            targetName: target.name,
            reason: reasonText,
          }),
        }
      : undefined,
    teams: true,
    teamsCardKind: "escalation",
  }).catch((err) => app.log.warn({ err, rule: rule.name, level }, "[escalation] notify failed"));

  await writeAudit(prisma, null, {
    action: "Escalation Raised",
    entityType: "ESCALATION",
    entityLabel: `${rule.name} — L${level}`,
    newValue: `Target: ${target.name}, escalated to ${escalatedTo?.name ?? escalatedToId}`,
    triggeredBy: "Scheduler",
  });

  app.log.info({ rule: rule.name, level, targetId, escalatedToId }, "[escalation] raised");
}
