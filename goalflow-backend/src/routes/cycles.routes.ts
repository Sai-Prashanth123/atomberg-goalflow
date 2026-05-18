import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { writeAudit } from "../lib/audit.js";

const cycleSchema = z.object({
  name: z.string().min(2),
  kind: z.enum(["GOAL_SETTING", "Q1", "Q2", "Q3", "Q4"]),
  openDate: z.string().datetime(),
  closeDate: z.string().datetime(),
  fiscalYear: z.string(),
});

const transitionSchema = z.object({
  status: z.enum(["UPCOMING", "ACTIVE", "CLOSED"]),
});

export async function cyclesRoutes(app: FastifyInstance) {
  app.get("/", { preHandler: app.authenticate }, async () => {
    const cycles = await app.prisma.cycle.findMany({ orderBy: { openDate: "asc" } });
    return { cycles };
  });

  app.get("/active", { preHandler: app.authenticate }, async () => {
    const now = new Date();
    const cycle = await app.prisma.cycle.findFirst({
      where: { status: "ACTIVE", openDate: { lte: now }, closeDate: { gte: now } },
    });
    return { cycle };
  });

  app.post("/", { preHandler: app.requireRole(["ADMIN"]) }, async (req, reply) => {
    const parse = cycleSchema.safeParse(req.body);
    if (!parse.success) return reply.code(400).send({ error: parse.error.flatten() });
    const cycle = await app.prisma.cycle.create({
      data: { ...parse.data, openDate: new Date(parse.data.openDate), closeDate: new Date(parse.data.closeDate) },
    });
    await writeAudit(app.prisma, req.user, {
      action: "Created Cycle",
      entityType: "CYCLE",
      entityId: cycle.id,
      entityLabel: cycle.name,
      triggeredBy: "Admin Action",
    });
    return { cycle };
  });

  app.patch("/:id", { preHandler: app.requireRole(["ADMIN"]) }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const parse = cycleSchema.partial().safeParse(req.body);
    if (!parse.success) return reply.code(400).send({ error: parse.error.flatten() });
    const before = await app.prisma.cycle.findUnique({ where: { id } });
    if (!before) return reply.code(404).send({ error: "Not found" });
    if (parse.data.openDate && parse.data.closeDate) {
      if (new Date(parse.data.closeDate) <= new Date(parse.data.openDate)) {
        return reply.code(400).send({ error: "Close date must be after open date" });
      }
    }
    const data: Record<string, unknown> = { ...parse.data };
    if (parse.data.openDate) data.openDate = new Date(parse.data.openDate);
    if (parse.data.closeDate) data.closeDate = new Date(parse.data.closeDate);
    const cycle = await app.prisma.cycle.update({ where: { id }, data });
    await writeAudit(app.prisma, req.user, {
      action: "Edited Cycle",
      entityType: "CYCLE",
      entityId: id,
      entityLabel: cycle.name,
      previousValue: `${before.name} · ${before.openDate.toISOString().slice(0, 10)} → ${before.closeDate.toISOString().slice(0, 10)}`,
      newValue: `${cycle.name} · ${cycle.openDate.toISOString().slice(0, 10)} → ${cycle.closeDate.toISOString().slice(0, 10)}`,
      triggeredBy: "Admin Action",
    });
    return { cycle };
  });

  app.patch("/:id/transition", { preHandler: app.requireRole(["ADMIN"]) }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const parse = transitionSchema.safeParse(req.body);
    if (!parse.success) return reply.code(400).send({ error: parse.error.flatten() });
    const before = await app.prisma.cycle.findUnique({ where: { id } });
    if (!before) return reply.code(404).send({ error: "Not found" });

    const cycle = await app.prisma.cycle.update({ where: { id }, data: { status: parse.data.status } });
    await writeAudit(app.prisma, req.user, {
      action: parse.data.status === "ACTIVE" ? "Cycle Opened" : parse.data.status === "CLOSED" ? "Cycle Closed" : "Cycle Updated",
      entityType: "CYCLE",
      entityId: id,
      entityLabel: cycle.name,
      previousValue: before.status,
      newValue: cycle.status,
      triggeredBy: "Admin Action",
    });
    return { cycle };
  });
}
