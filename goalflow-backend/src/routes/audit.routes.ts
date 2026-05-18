import type { FastifyInstance } from "fastify";
import { toCsv } from "../lib/csv.js";

export async function auditRoutes(app: FastifyInstance) {
  app.get("/", { preHandler: app.requireRole(["ADMIN"]) }, async (req) => {
    const q = req.query as { user?: string; action?: string; postLock?: string; from?: string; to?: string };
    const where: Record<string, unknown> = {};
    if (q.user) where.userName = { contains: q.user };
    if (q.action) where.action = q.action;
    if (q.postLock === "true") where.postLock = true;
    if (q.from || q.to) {
      where.timestamp = {
        ...(q.from ? { gte: new Date(q.from) } : {}),
        ...(q.to ? { lte: new Date(q.to) } : {}),
      };
    }
    const entries = await app.prisma.auditEntry.findMany({ where, orderBy: { timestamp: "desc" }, take: 500 });
    return { entries };
  });

  app.get("/export.csv", { preHandler: app.requireRole(["ADMIN"]) }, async (_req, reply) => {
    const entries = await app.prisma.auditEntry.findMany({ orderBy: { timestamp: "desc" } });
    const csv = toCsv(
      entries.map((e) => ({
        timestamp: e.timestamp.toISOString(),
        user: e.userName,
        action: e.action,
        entityType: e.entityType,
        entityLabel: e.entityLabel,
        previousValue: e.previousValue ?? "",
        newValue: e.newValue ?? "",
        triggeredBy: e.triggeredBy,
        postLock: e.postLock,
      })),
      [
        { key: "timestamp", header: "Timestamp" },
        { key: "user", header: "User" },
        { key: "action", header: "Action" },
        { key: "entityType", header: "Entity" },
        { key: "entityLabel", header: "Label" },
        { key: "previousValue", header: "Previous" },
        { key: "newValue", header: "New" },
        { key: "triggeredBy", header: "Trigger" },
        { key: "postLock", header: "Post-Lock" },
      ],
    );
    reply.header("Content-Type", "text/csv").header("Content-Disposition", 'attachment; filename="audit.csv"');
    return csv;
  });
}
