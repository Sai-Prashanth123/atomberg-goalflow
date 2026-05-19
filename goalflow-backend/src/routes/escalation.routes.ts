import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { tickEscalations } from "../services/escalation.service.js";
import { writeAudit } from "../lib/audit.js";

const ruleSchema = z.object({
  name: z.string().min(2),
  trigger: z.enum(["GOAL_NOT_SUBMITTED", "APPROVAL_PENDING", "CHECKIN_INCOMPLETE"]),
  thresholdDays: z.number().min(1).max(90),
  enabled: z.boolean().default(true),
});

export async function escalationRoutes(app: FastifyInstance) {
  app.get("/rules", { preHandler: app.authenticate }, async () => {
    const rules = await app.prisma.escalationRule.findMany({ orderBy: { createdAt: "asc" } });
    return { rules };
  });

  app.post("/rules", { preHandler: app.requireRole(["ADMIN"]) }, async (req, reply) => {
    const parse = ruleSchema.safeParse(req.body);
    if (!parse.success) return reply.code(400).send({ error: parse.error.flatten() });
    const rule = await app.prisma.escalationRule.create({ data: parse.data });
    await writeAudit(app.prisma, req.user, {
      action: "Created Escalation Rule",
      entityType: "ESCALATION",
      entityId: rule.id,
      entityLabel: rule.name,
      newValue: `${rule.trigger} @ ${rule.thresholdDays}d, enabled=${rule.enabled}`,
      triggeredBy: "Admin Action",
    });
    return { rule };
  });

  app.patch("/rules/:id", { preHandler: app.requireRole(["ADMIN"]) }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const parse = ruleSchema.partial().safeParse(req.body);
    if (!parse.success) return reply.code(400).send({ error: parse.error.flatten() });
    const previous = await app.prisma.escalationRule.findUnique({ where: { id } });
    if (!previous) return reply.code(404).send({ error: "Rule not found" });
    const rule = await app.prisma.escalationRule.update({ where: { id }, data: parse.data });
    await writeAudit(app.prisma, req.user, {
      action: "Updated Escalation Rule",
      entityType: "ESCALATION",
      entityId: rule.id,
      entityLabel: rule.name,
      previousValue: `${previous.trigger} @ ${previous.thresholdDays}d, enabled=${previous.enabled}`,
      newValue: `${rule.trigger} @ ${rule.thresholdDays}d, enabled=${rule.enabled}`,
      triggeredBy: "Admin Action",
    });
    return { rule };
  });

  app.delete("/rules/:id", { preHandler: app.requireRole(["ADMIN"]) }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const existing = await app.prisma.escalationRule.findUnique({ where: { id } });
    if (!existing) return reply.code(404).send({ error: "Rule not found" });
    await app.prisma.escalationRule.delete({ where: { id } });
    await writeAudit(app.prisma, req.user, {
      action: "Deleted Escalation Rule",
      entityType: "ESCALATION",
      entityId: existing.id,
      entityLabel: existing.name,
      previousValue: `${existing.trigger} @ ${existing.thresholdDays}d, enabled=${existing.enabled}`,
      newValue: "deleted",
      triggeredBy: "Admin Action",
    });
    return { ok: true };
  });

  app.get("/events", { preHandler: app.requireRole(["ADMIN", "MANAGER"]) }, async () => {
    const events = await app.prisma.escalationEvent.findMany({
      include: { rule: true, target: { select: { id: true, name: true } }, escalatedTo: { select: { id: true, name: true } } },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
    return { events };
  });

  // Manual trigger for demo / testing
  app.post("/tick", { preHandler: app.requireRole(["ADMIN"]) }, async (req) => {
    await tickEscalations(app);
    return { ok: true, ranAt: new Date().toISOString() };
  });

  // Mark an escalation as resolved — closes the loop on the BRD §5.3 governance flow.
  app.patch("/events/:id/resolve", { preHandler: app.requireRole(["ADMIN", "MANAGER"]) }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const existing = await app.prisma.escalationEvent.findUnique({
      where: { id },
      include: { rule: true, target: { select: { name: true } } },
    });
    if (!existing) return reply.code(404).send({ error: "Escalation event not found" });
    if (existing.resolved) return reply.code(400).send({ error: "Escalation is already resolved" });

    const event = await app.prisma.escalationEvent.update({
      where: { id },
      data: { resolved: true },
    });

    await writeAudit(app.prisma, req.user, {
      action: "Resolved Escalation",
      entityType: "ESCALATION",
      entityId: event.id,
      entityLabel: `${existing.rule.name} — L${existing.level}`,
      newValue: `Target: ${existing.target?.name ?? "unknown"}`,
      triggeredBy: "Admin Action",
    });

    return { event };
  });
}
