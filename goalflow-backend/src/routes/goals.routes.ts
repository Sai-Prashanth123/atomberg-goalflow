import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { writeAudit } from "../lib/audit.js";
import { getActiveCycle, getActiveQuarter, isWithinCycle } from "../lib/cycle.js";
import { notify } from "../services/notification.service.js";
import { goalSubmittedHtml, goalApprovedHtml, goalReturnedHtml } from "../lib/email.js";
import { computeScore } from "../lib/score.js";

// Normalize once: strip trailing slash(es) so deep links never produce //path.
const APP_URL = (process.env.APP_URL ?? "http://localhost:8080").replace(/\/+$/, "");

const goalShapeSchema = z.object({
  thrustArea: z.enum(["ENERGY_EFFICIENCY", "MARKET_EXPANSION", "PRODUCT_INNOVATION", "CUSTOMER_SUCCESS", "OPERATIONAL_EXCELLENCE"]),
  title: z.string().min(2, "Title must be at least 2 characters").max(140, "Title too long (max 140 chars)"),
  description: z.string().max(2000, "Description too long").default(""),
  uom: z.enum(["NUMERIC", "PERCENTAGE", "TIMELINE", "ZERO_BASED"]),
  direction: z.enum(["MIN", "MAX"]).default("MIN"),
  target: z.number().finite("Target must be a number"),
  weightage: z.number().min(10, "Minimum weightage is 10%").max(100, "Weightage cannot exceed 100%"),
});

// UoM-aware target / direction validation. Used for both create + patch.
function applyUomRules<T extends { uom?: string; target?: number; direction?: "MIN" | "MAX" }>(
  data: T,
  ctx: z.RefinementCtx,
): void {
  if (data.uom === "ZERO_BASED" && data.target !== undefined && data.target !== 0) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Zero-based goals require target = 0", path: ["target"] });
  }
  if (data.uom === "TIMELINE" && data.target !== undefined && data.target <= 0) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Timeline goals require target > 0 (deadline in days)", path: ["target"] });
  }
  if (data.uom === "PERCENTAGE" && data.target !== undefined && (data.target < 0 || data.target > 100)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Percentage target must be 0–100", path: ["target"] });
  }
}

function normalizeDirection<T extends { uom?: string; direction?: "MIN" | "MAX" }>(data: T): T {
  // direction is only meaningful for NUMERIC/PERCENTAGE
  if (data.uom && data.uom !== "NUMERIC" && data.uom !== "PERCENTAGE") {
    return { ...data, direction: "MIN" };
  }
  return data;
}

const goalCreateSchema = goalShapeSchema.superRefine(applyUomRules).transform(normalizeDirection);

const goalPatchSchema = goalShapeSchema.partial().superRefine(applyUomRules).transform(normalizeDirection);

const quarterPatchSchema = z.object({
  actual: z.number().nullable().optional(),
  status: z.enum(["NOT_STARTED", "ON_TRACK", "COMPLETED"]).optional(),
  note: z.string().nullable().optional(),
});

export async function goalsRoutes(app: FastifyInstance) {
  // List goals — scoped by query: ?ownerId=... or ?teamOf=managerId or ?mine=1
  // Role-aware authorization (BRD §3): EMPLOYEE → own only, MANAGER → own + direct
  // reports, ADMIN → no filter. Requested filters are intersected with this scope so
  // a junior user cannot exfiltrate goals by passing a different ownerId.
  app.get("/", { preHandler: app.authenticate }, async (req, reply) => {
    const q = req.query as { ownerId?: string; teamOf?: string; mine?: string; cycleId?: string };
    const role = req.user.role;
    const callerId = req.user.sub;

    // Compute the set of owner IDs this caller is allowed to see.
    let allowedOwnerIds: string[] | null = null; // null = no restriction (admin only)
    if (role === "EMPLOYEE") {
      allowedOwnerIds = [callerId];
    } else if (role === "MANAGER") {
      const reports = await app.prisma.user.findMany({ where: { managerId: callerId }, select: { id: true } });
      allowedOwnerIds = [callerId, ...reports.map((r) => r.id)];
    }
    // ADMIN → allowedOwnerIds stays null, full org-wide visibility.

    // Compute the requested owner filter (if any).
    let requestedOwnerIds: string[] | null = null;
    if (q.mine) requestedOwnerIds = [callerId];
    else if (q.ownerId) requestedOwnerIds = [q.ownerId];
    else if (q.teamOf) {
      const reports = await app.prisma.user.findMany({ where: { managerId: q.teamOf }, select: { id: true } });
      requestedOwnerIds = reports.map((r) => r.id);
    }

    // Intersect requested filter with allowed scope. Non-admins requesting outside
    // their scope get an empty result (not a 403, to avoid leaking existence info).
    let finalOwnerIds: string[] | null = null;
    if (allowedOwnerIds === null) {
      finalOwnerIds = requestedOwnerIds;
    } else if (requestedOwnerIds === null) {
      finalOwnerIds = allowedOwnerIds;
    } else {
      finalOwnerIds = requestedOwnerIds.filter((id) => allowedOwnerIds!.includes(id));
    }

    const where: Record<string, unknown> = {};
    if (finalOwnerIds !== null) where.ownerId = { in: finalOwnerIds };
    if (q.cycleId) where.cycleId = q.cycleId;

    const goals = await app.prisma.goal.findMany({
      where,
      include: { quarters: true, owner: { select: { id: true, name: true, email: true } } },
      orderBy: { createdAt: "asc" },
    });
    return reply.send({ goals });
  });

  app.get("/:id", { preHandler: app.authenticate }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const goal = await app.prisma.goal.findUnique({
      where: { id },
      include: { quarters: true, owner: true, sharedPrimary: true, sharedClones: true },
    });
    if (!goal) return reply.code(404).send({ error: "Goal not found" });

    // Role-aware visibility check (BRD §3). Admins see everything; managers see
    // own + direct reports; employees see only their own goals.
    const role = req.user.role;
    const callerId = req.user.sub;
    if (role !== "ADMIN") {
      let allowed = goal.ownerId === callerId;
      if (!allowed && role === "MANAGER") {
        const owner = await app.prisma.user.findUnique({ where: { id: goal.ownerId }, select: { managerId: true } });
        allowed = owner?.managerId === callerId;
      }
      if (!allowed) return reply.code(403).send({ error: "Forbidden" });
    }

    return { goal };
  });

  // Create — employee draft
  app.post("/", { preHandler: app.authenticate }, async (req, reply) => {
    const parse = goalCreateSchema.safeParse(req.body);
    if (!parse.success) return reply.code(400).send({ error: parse.error.flatten() });

    const existing = await app.prisma.goal.findMany({ where: { ownerId: req.user.sub } });
    if (existing.length >= 8) {
      return reply.code(400).send({ error: "Max 8 goals per employee" });
    }

    const goal = await app.prisma.goal.create({
      data: {
        ...parse.data,
        ownerId: req.user.sub,
        approvalStatus: "DRAFT",
        fiscalYear: new Date().getFullYear().toString(),
        quarters: { create: (["Q1", "Q2", "Q3", "Q4"] as const).map((quarter) => ({ quarter })) },
      },
      include: { quarters: true },
    });

    await writeAudit(app.prisma, req.user, {
      action: "Created Goal",
      entityType: "GOAL",
      entityId: goal.id,
      entityLabel: goal.title,
      newValue: `${goal.uom} target ${goal.target}, weight ${goal.weightage}%`,
      triggeredBy: "Self Update",
    });

    return { goal };
  });

  // Patch (edit) — own draft, or manager during review, or admin
  app.patch("/:id", { preHandler: app.authenticate }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const parse = goalPatchSchema.safeParse(req.body);
    if (!parse.success) return reply.code(400).send({ error: parse.error.flatten() });

    const existing = await app.prisma.goal.findUnique({ where: { id } });
    if (!existing) return reply.code(404).send({ error: "Goal not found" });

    const isOwner = existing.ownerId === req.user.sub;
    const isManager = req.user.role === "MANAGER";
    const isAdmin = req.user.role === "ADMIN";

    if (!isOwner && !isManager && !isAdmin) {
      return reply.code(403).send({ error: "Not your goal" });
    }

    // Lock enforcement: locked goals can only be edited by admin
    if (existing.locked && !isAdmin) {
      return reply.code(403).send({ error: "Goal is locked. Admin unlock required to edit." });
    }

    // Shared clones: only weightage editable
    if (existing.isSharedClone) {
      const allowedKeys = ["weightage"];
      const offending = Object.keys(parse.data).filter((k) => !allowedKeys.includes(k));
      if (offending.length) {
        return reply.code(400).send({ error: `On shared clones only weightage is editable. Disallowed: ${offending.join(", ")}` });
      }
    }

    const previous = JSON.stringify({ target: existing.target, weightage: existing.weightage, title: existing.title });
    const updated = await app.prisma.goal.update({ where: { id }, data: parse.data });

    await writeAudit(app.prisma, req.user, {
      action: existing.locked ? "Edited Locked Goal" : "Updated Goal",
      entityType: "GOAL",
      entityId: id,
      entityLabel: updated.title,
      previousValue: previous,
      newValue: JSON.stringify({ target: updated.target, weightage: updated.weightage, title: updated.title }),
      triggeredBy: isAdmin ? "Admin Action" : isManager ? "Manager Review" : "Self Update",
      postLock: existing.locked,
    });

    return { goal: updated };
  });

  // Delete (drafts only)
  app.delete("/:id", { preHandler: app.authenticate }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const goal = await app.prisma.goal.findUnique({ where: { id } });
    if (!goal) return reply.code(404).send({ error: "Not found" });
    if (goal.ownerId !== req.user.sub && req.user.role !== "ADMIN") {
      return reply.code(403).send({ error: "Forbidden" });
    }
    if (goal.approvalStatus !== "DRAFT" && req.user.role !== "ADMIN") {
      return reply.code(400).send({ error: "Only DRAFT goals can be deleted" });
    }
    await app.prisma.goal.delete({ where: { id } });
    await writeAudit(app.prisma, req.user, {
      action: "Deleted Goal",
      entityType: "GOAL",
      entityId: id,
      entityLabel: goal.title,
      triggeredBy: req.user.role === "ADMIN" ? "Admin Action" : "Self Update",
    });
    return { ok: true };
  });

  // Submit all DRAFT goals — enforces weightage = 100
  app.post("/submit", { preHandler: app.authenticate }, async (req, reply) => {
    // BRD §2.1 validation counts EVERY goal the employee owns (draft + returned
    // + pending + approved). Locked goals carry weightage too — the BRD says
    // "Total weightage across all goals must equal 100%", not "across drafts".
    const allGoals = await app.prisma.goal.findMany({ where: { ownerId: req.user.sub } });
    const drafts = allGoals.filter((g) => g.approvalStatus === "DRAFT" || g.approvalStatus === "RETURNED");
    if (!drafts.length) return reply.code(400).send({ error: "No draft goals to submit" });

    if (allGoals.length > 8) {
      return reply.code(400).send({ error: `Max 8 goals per cycle (you have ${allGoals.length})` });
    }
    if (drafts.some((g) => g.weightage < 10)) {
      return reply.code(400).send({ error: "Each goal must have weightage >= 10%" });
    }
    const total = allGoals.reduce((s, g) => s + g.weightage, 0);
    if (total !== 100) {
      const lockedSum = allGoals.filter((g) => g.approvalStatus === "APPROVED" || g.approvalStatus === "PENDING").reduce((s, g) => s + g.weightage, 0);
      const draftSum = drafts.reduce((s, g) => s + g.weightage, 0);
      return reply.code(400).send({
        error:
          `Total weightage across all your goals must equal 100% (currently ${total}%). ` +
          `Locked & pending goals contribute ${lockedSum}%; your drafts contribute ${draftSum}%. ` +
          `Adjust a draft's weightage to fit, or ask an admin to unlock an approved goal.`,
      });
    }

    await app.prisma.goal.updateMany({
      where: { id: { in: drafts.map((g) => g.id) } },
      data: { approvalStatus: "PENDING", submittedAt: new Date() },
    });

    // Notify manager
    const owner = await app.prisma.user.findUnique({ where: { id: req.user.sub }, include: { manager: true } });
    if (owner?.manager) {
      const link = `${APP_URL}/manager/team/${owner.id}`;
      await notify(app.prisma, {
        userId: owner.manager.id,
        type: "SUBMIT",
        message: `${owner.name} submitted ${drafts.length} goals for approval.`,
        link,
        email: {
          to: owner.manager.email,
          subject: `Goals submitted by ${owner.name}`,
          html: goalSubmittedHtml({ managerName: owner.manager.name, employeeName: owner.name, count: drafts.length, link }),
        },
        teams: true,
        teamsCardKind: "submit",
      });
    }

    await writeAudit(app.prisma, req.user, {
      action: "Submitted Goals",
      entityType: "GOAL",
      entityLabel: `${drafts.length} goals`,
      newValue: "PENDING",
      triggeredBy: "Self Update",
    });

    return { submitted: drafts.length };
  });

  // Manager approves a goal — locks it
  app.patch("/:id/approve", { preHandler: app.requireRole(["MANAGER", "ADMIN"]) }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const goal = await app.prisma.goal.findUnique({ where: { id }, include: { owner: true } });
    if (!goal) return reply.code(404).send({ error: "Not found" });

    if (req.user.role === "MANAGER" && goal.owner.managerId !== req.user.sub) {
      return reply.code(403).send({ error: "Not your direct report" });
    }

    const updated = await app.prisma.goal.update({
      where: { id },
      data: { approvalStatus: "APPROVED", locked: true, approvedAt: new Date(), approvedById: req.user.sub, returnReason: null },
    });

    await writeAudit(app.prisma, req.user, {
      action: "Approved Goal",
      entityType: "GOAL",
      entityId: id,
      entityLabel: goal.title,
      previousValue: goal.approvalStatus,
      newValue: "APPROVED",
      triggeredBy: "Manager Review",
    });

    const empLink = `${APP_URL}/employee/goals`;
    await notify(app.prisma, {
      userId: goal.ownerId,
      type: "APPROVAL",
      message: `Your goal "${goal.title}" was approved.`,
      link: empLink,
      email: {
        to: goal.owner.email,
        subject: `Goal approved — ${goal.title}`,
        html: goalApprovedHtml({ employeeName: goal.owner.name, goalTitle: goal.title, link: empLink }),
      },
      teams: true,
      teamsCardKind: "approval",
    });

    return { goal: updated };
  });

  // Manager returns a goal for rework
  app.patch("/:id/return", { preHandler: app.requireRole(["MANAGER", "ADMIN"]) }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = z.object({ reason: z.string().min(2) }).safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: body.error.flatten() });

    const goal = await app.prisma.goal.findUnique({ where: { id }, include: { owner: true } });
    if (!goal) return reply.code(404).send({ error: "Not found" });

    if (req.user.role === "MANAGER" && goal.owner.managerId !== req.user.sub) {
      return reply.code(403).send({ error: "Not your direct report" });
    }

    const updated = await app.prisma.goal.update({
      where: { id },
      data: { approvalStatus: "RETURNED", returnReason: body.data.reason },
    });

    await writeAudit(app.prisma, req.user, {
      action: "Returned Goal",
      entityType: "GOAL",
      entityId: id,
      entityLabel: goal.title,
      previousValue: goal.approvalStatus,
      newValue: `RETURNED: ${body.data.reason}`,
      triggeredBy: "Manager Review",
    });

    const empLinkR = `${APP_URL}/employee/goals`;
    await notify(app.prisma, {
      userId: goal.ownerId,
      type: "RETURN",
      message: `Manager returned "${goal.title}" for rework: ${body.data.reason}`,
      link: empLinkR,
      email: {
        to: goal.owner.email,
        subject: `Goal returned — ${goal.title}`,
        html: goalReturnedHtml({ employeeName: goal.owner.name, goalTitle: goal.title, reason: body.data.reason, link: empLinkR }),
      },
      teams: true,
      teamsCardKind: "return",
    });

    return { goal: updated };
  });

  // Admin unlock — required by BRD §3
  app.post("/:id/unlock", { preHandler: app.requireRole(["ADMIN"]) }, async (req, reply) => {
    const { id } = req.params as { id: string };
    // Optional reason — captured in audit so HR can later trace WHY a locked goal was changed (BRD §4).
    const body = z.object({ reason: z.string().min(2).max(500).optional() }).safeParse(req.body ?? {});
    if (!body.success) return reply.code(400).send({ error: body.error.flatten() });

    const goal = await app.prisma.goal.findUnique({ where: { id } });
    if (!goal) return reply.code(404).send({ error: "Not found" });
    if (!goal.locked) return reply.code(400).send({ error: "Already unlocked" });

    const updated = await app.prisma.goal.update({ where: { id }, data: { locked: false } });
    await writeAudit(app.prisma, req.user, {
      action: "Unlocked Goal",
      entityType: "GOAL",
      entityId: id,
      entityLabel: goal.title,
      previousValue: "Locked",
      newValue: body.data.reason ? `Unlocked — reason: ${body.data.reason}` : "Unlocked",
      triggeredBy: "Admin Override",
      postLock: true,
    });
    return { goal: updated };
  });

  // Quarterly check-in — BRD §2.2, with cycle window enforcement
  app.patch("/:id/quarter/:q", { preHandler: app.authenticate }, async (req, reply) => {
    const { id, q } = req.params as { id: string; q: "Q1" | "Q2" | "Q3" | "Q4" };
    const parse = quarterPatchSchema.safeParse(req.body);
    if (!parse.success) return reply.code(400).send({ error: parse.error.flatten() });

    const goal = await app.prisma.goal.findUnique({ where: { id } });
    if (!goal) return reply.code(404).send({ error: "Not found" });

    // Only owner can update actuals (except admin override)
    if (goal.ownerId !== req.user.sub && req.user.role !== "ADMIN") {
      return reply.code(403).send({ error: "Not your goal" });
    }

    // Shared clones: actuals come from PRIMARY, not editable here
    if (goal.isSharedClone) {
      return reply.code(400).send({ error: "Shared clone — update the primary goal; actuals sync automatically." });
    }

    // Cycle window enforcement
    const activeCycle = await getActiveCycle(app.prisma);
    const activeQuarter = await getActiveQuarter(app.prisma);
    if (req.user.role !== "ADMIN") {
      if (!activeCycle) return reply.code(400).send({ error: "No active check-in window" });
      if (activeQuarter !== q) return reply.code(400).send({ error: `Active window is ${activeQuarter ?? "Goal Setting"}, not ${q}` });
      if (!isWithinCycle(activeCycle)) return reply.code(400).send({ error: "Check-in window is closed" });
    }

    const previous = await app.prisma.quarterUpdate.findUnique({ where: { goalId_quarter: { goalId: id, quarter: q } } });

    const updated = await app.prisma.quarterUpdate.upsert({
      where: { goalId_quarter: { goalId: id, quarter: q } },
      create: { goalId: id, quarter: q, actual: parse.data.actual ?? null, status: parse.data.status ?? "NOT_STARTED", note: parse.data.note ?? null, updatedById: req.user.sub },
      update: { ...parse.data, updatedById: req.user.sub },
    });

    // If this is a shared PRIMARY, sync actual to all clones
    if (goal.isSharedPrimary) {
      const clones = await app.prisma.goal.findMany({ where: { sharedPrimaryId: goal.id } });
      for (const clone of clones) {
        await app.prisma.quarterUpdate.upsert({
          where: { goalId_quarter: { goalId: clone.id, quarter: q } },
          create: { goalId: clone.id, quarter: q, actual: updated.actual, status: updated.status, note: updated.note, updatedById: req.user.sub },
          update: { actual: updated.actual, status: updated.status, note: updated.note, updatedById: req.user.sub },
        });
      }
    }

    await writeAudit(app.prisma, req.user, {
      action: "Updated Achievement",
      entityType: "QUARTER",
      entityId: id,
      entityLabel: `${goal.title} — ${q}`,
      previousValue: previous?.actual?.toString() ?? "—",
      newValue: updated.actual?.toString() ?? "—",
      triggeredBy: `${q} Check-in`,
      postLock: goal.locked,
    });

    // BRD §5.2 — notify the owner's manager so they see updates in real time.
    // Teams + in-app only (no email — managers reviewing 5+ reports during
    // check-in week shouldn't drown in transactional inbox noise; the team
    // dashboard is the canonical roll-up view). Soft-skip when:
    //   - the goal owner has no manager set (e.g. SSO-provisioned with null managerId)
    //   - the actor IS the manager (admin/manager logging actuals on someone else's goal — no self-notify)
    try {
      const goalOwner = await app.prisma.goal.findUnique({
        where: { id },
        include: { owner: { include: { manager: true } } },
      });
      const manager = goalOwner?.owner.manager ?? null;
      if (manager && manager.id !== req.user.sub) {
        const score = computeScore(goalOwner!, updated);
        const link = `${APP_URL}/manager/team/${goalOwner!.ownerId}`;
        const titleShort = goalOwner!.title.length > 36 ? `${goalOwner!.title.slice(0, 33)}…` : goalOwner!.title;
        await notify(app.prisma, {
          userId: manager.id,
          type: "SUBMIT",
          message: `${goalOwner!.owner.name} updated "${titleShort}" (${q}) — actual ${updated.actual ?? "—"} · ${score.display}`,
          link,
          teams: true,
          teamsCardKind: "submit",
        }).catch((err) => app.log.warn({ err }, "[checkin-update] notify manager failed"));
      }
    } catch (err) {
      app.log.warn({ err }, "[checkin-update] manager notify guard failed");
    }

    return { quarter: updated };
  });
}
