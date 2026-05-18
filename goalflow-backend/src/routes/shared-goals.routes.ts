import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { writeAudit } from "../lib/audit.js";
import { notify } from "../services/notification.service.js";

// Normalize APP_URL once: strip trailing slash(es) so deep links never produce //path.
const APP_URL = (process.env.APP_URL ?? "http://localhost:8080").replace(/\/+$/, "");

const pushSchema = z.object({
  thrustArea: z.enum(["ENERGY_EFFICIENCY", "MARKET_EXPANSION", "PRODUCT_INNOVATION", "CUSTOMER_SUCCESS", "OPERATIONAL_EXCELLENCE"]),
  title: z.string().min(2),
  description: z.string().default(""),
  uom: z.enum(["NUMERIC", "PERCENTAGE", "TIMELINE", "ZERO_BASED"]),
  direction: z.enum(["MIN", "MAX"]).default("MIN"),
  target: z.number(),
  primaryOwnerId: z.string(),
  recipientIds: z.array(z.string()).min(1),
  weightagePerRecipient: z.number().min(10).max(100).default(10),
});

export async function sharedGoalsRoutes(app: FastifyInstance) {
  // Admin or Manager pushes a departmental KPI to multiple recipients.
  // BRD §2.1: Primary owner enters actuals; clones inherit. Clones may adjust weightage only.
  app.post("/", { preHandler: app.requireRole(["MANAGER", "ADMIN"]) }, async (req, reply) => {
    const parse = pushSchema.safeParse(req.body);
    if (!parse.success) return reply.code(400).send({ error: parse.error.flatten() });

    const { primaryOwnerId, recipientIds, weightagePerRecipient, ...goalBase } = parse.data;

    const fiscalYear = new Date().getFullYear().toString();
    const uniqueRecipients = recipientIds.filter((rid) => rid !== primaryOwnerId);

    // Atomic creation of primary + all clones — either all rows commit, or none do.
    // Notifications and audit are fired AFTER the transaction so a notification
    // failure can't roll back the data.
    const { primary, cloneIds } = await app.prisma.$transaction(async (tx) => {
      const primary = await tx.goal.create({
        data: {
          ...goalBase,
          ownerId: primaryOwnerId,
          approvalStatus: "APPROVED",
          locked: true,
          isSharedPrimary: true,
          weightage: weightagePerRecipient,
          fiscalYear,
          quarters: { create: (["Q1", "Q2", "Q3", "Q4"] as const).map((quarter) => ({ quarter })) },
        },
      });

      const cloneIds: string[] = [];
      for (const rid of uniqueRecipients) {
        const clone = await tx.goal.create({
          data: {
            ...goalBase,
            ownerId: rid,
            approvalStatus: "APPROVED",
            locked: true,
            isSharedClone: true,
            sharedPrimaryId: primary.id,
            weightage: weightagePerRecipient,
            fiscalYear,
            quarters: { create: (["Q1", "Q2", "Q3", "Q4"] as const).map((quarter) => ({ quarter })) },
          },
        });
        cloneIds.push(clone.id);
      }
      return { primary, cloneIds };
    });

    // Post-commit: notify each recipient + write audit. Errors here don't undo the data.
    for (const rid of uniqueRecipients) {
      const recipient = await app.prisma.user.findUnique({ where: { id: rid } });
      if (recipient) {
        await notify(app.prisma, {
          userId: rid,
          type: "SHARED_GOAL",
          message: `New shared goal: "${primary.title}". You can adjust weightage only.`,
          link: `${APP_URL}/employee/goals`,
          email: { to: recipient.email, subject: `Shared goal: ${primary.title}` },
        }).catch((err) => app.log.warn({ err, rid }, "shared-goal notify failed"));
      }
    }

    await writeAudit(app.prisma, req.user, {
      action: "Pushed Shared Goal",
      entityType: "SHARED_GOAL",
      entityId: primary.id,
      entityLabel: primary.title,
      newValue: `${uniqueRecipients.length} recipients`,
      triggeredBy: "Admin Action",
    });

    return { primary, cloneCount: cloneIds.length };
  });

  // List shared goal groups
  app.get("/", { preHandler: app.authenticate }, async () => {
    const primaries = await app.prisma.goal.findMany({
      where: { isSharedPrimary: true },
      include: { owner: { select: { id: true, name: true } }, sharedClones: { include: { owner: { select: { id: true, name: true } } } } },
      orderBy: { createdAt: "desc" },
    });
    return { sharedGoals: primaries };
  });
}
