import cron from "node-cron";
import type { FastifyInstance } from "fastify";
import type { CycleStatus, Cycle } from "@prisma/client";
import { writeAudit } from "../lib/audit.js";
import { notify } from "./notification.service.js";
import { checkinReminderHtml } from "../lib/email.js";

// BRD §2.3 — quarterly windows must be enforced for achievement capture.
// Manual admin transitions still work (`cycles.routes.ts` /transition route),
// but this scheduler is a safety net so the system survives an admin forgetting
// to flip Q2 → ACTIVE on October 1st. Runs on every backend boot AND daily
// at 00:15 server-local time.
//
// BRD §5.2 — when a quarterly cycle (Q1-Q4, not Goal Setting) flips to ACTIVE,
// fan out a check-in reminder to every employee with an APPROVED goal so they
// have a proactive nudge to log their actuals.

// Normalize APP_URL once for clean deep-links (no trailing slash).
const APP_URL = (process.env.APP_URL ?? "http://localhost:8080").replace(/\/+$/, "");

function pickStatus(now: Date, openDate: Date, closeDate: Date): CycleStatus {
  if (now < openDate) return "UPCOMING";
  if (now > closeDate) return "CLOSED";
  return "ACTIVE";
}

function formatShortDate(d: Date): string {
  // "15 Jul 2026" — keep manual to avoid pulling date-fns into the backend
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${d.getUTCDate().toString().padStart(2, "0")} ${months[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

async function broadcastCheckinReminder(app: FastifyInstance, cycle: Cycle): Promise<number> {
  const { prisma } = app;
  // BRD §5.2 — only employees with APPROVED goals need check-in reminders.
  const employees = await prisma.user.findMany({
    where: {
      role: "EMPLOYEE",
      goals: { some: { approvalStatus: "APPROVED" } },
    },
    select: { id: true, name: true, email: true },
  });
  if (!employees.length) return 0;

  const link = `${APP_URL}/employee/check-in`;
  const closeDateText = formatShortDate(cycle.closeDate);

  let sent = 0;
  for (const emp of employees) {
    try {
      await notify(prisma, {
        userId: emp.id,
        type: "CHECKIN_REMINDER",
        message: `${cycle.name} is now open. Log your actuals before ${closeDateText}.`,
        link,
        email: {
          to: emp.email,
          subject: `${cycle.name} is open — log your progress`,
          html: checkinReminderHtml({
            employeeName: emp.name,
            quarterName: cycle.name,
            closeDate: closeDateText,
            link,
          }),
        },
        teams: true,
        teamsCardKind: "submit",
      });
      sent++;
    } catch (err) {
      app.log.warn({ err, userId: emp.id, email: emp.email }, "[checkin-reminder] notify failed");
    }
  }

  await writeAudit(prisma, null, {
    action: "Sent Check-in Reminders",
    entityType: "CYCLE",
    entityId: cycle.id,
    entityLabel: cycle.name,
    newValue: `${sent} of ${employees.length} recipients reached`,
    triggeredBy: "Scheduler",
  });
  app.log.info({ cycle: cycle.name, recipients: sent }, "[checkin-reminder] broadcast sent");
  return sent;
}

export async function reconcileCycleStatuses(app: FastifyInstance): Promise<number> {
  const { prisma } = app;
  const now = new Date();
  const cycles = await prisma.cycle.findMany();
  let transitioned = 0;
  for (const c of cycles) {
    const shouldBe = pickStatus(now, c.openDate, c.closeDate);
    if (c.status === shouldBe) continue;
    await prisma.cycle.update({ where: { id: c.id }, data: { status: shouldBe } });
    await writeAudit(prisma, null, {
      action: "Cycle Auto-Transitioned",
      entityType: "CYCLE",
      entityId: c.id,
      entityLabel: c.name,
      previousValue: c.status,
      newValue: shouldBe,
      triggeredBy: "Scheduler",
    });
    app.log.info({ cycle: c.name, from: c.status, to: shouldBe }, "[cycle] auto-transitioned");
    transitioned++;

    // BRD §5.2 — broadcast check-in reminder when a quarterly window opens.
    // Skip GOAL_SETTING (that's for creating goals, not entering actuals).
    if (shouldBe === "ACTIVE" && c.kind !== "GOAL_SETTING") {
      await broadcastCheckinReminder(app, { ...c, status: shouldBe }).catch((err) =>
        app.log.error({ err, cycle: c.name }, "[checkin-reminder] broadcast failed"),
      );
    }
  }
  return transitioned;
}

let scheduledTask: cron.ScheduledTask | null = null;

export function startCycleScheduler(app: FastifyInstance) {
  // Stop any prior schedule (defensive — tsx watch may re-import on reload).
  if (scheduledTask) {
    scheduledTask.stop();
    scheduledTask = null;
  }
  // Reconcile immediately at boot so the initial cycle statuses are correct
  // before anyone hits the API.
  reconcileCycleStatuses(app).catch((err) =>
    app.log.error({ err }, "[cycle] boot reconcile failed"),
  );
  // Then daily at 00:15 local time — a single tick per day is enough since
  // cycle boundaries are date-day-granular, not hour-granular.
  scheduledTask = cron.schedule("15 0 * * *", () => {
    reconcileCycleStatuses(app).catch((err) =>
      app.log.error({ err }, "[cycle] daily reconcile failed"),
    );
  });
  app.log.info("[cycle] scheduler started (daily @ 00:15 + on boot)");
}

export function stopCycleScheduler() {
  if (scheduledTask) {
    scheduledTask.stop();
    scheduledTask = null;
  }
}
