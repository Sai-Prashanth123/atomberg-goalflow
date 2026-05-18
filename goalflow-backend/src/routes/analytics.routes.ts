import type { FastifyInstance } from "fastify";
import { computeScore, overallScore } from "../lib/score.js";

export async function analyticsRoutes(app: FastifyInstance) {
  // QoQ trend across all employees (or filtered)
  app.get("/qoq", { preHandler: app.requireRole(["ADMIN", "MANAGER"]) }, async (req) => {
    const q = req.query as { department?: string; userId?: string };
    const where: Record<string, unknown> = {};
    if (q.userId) where.ownerId = q.userId;
    if (q.department) where.owner = { department: q.department };
    const goals = await app.prisma.goal.findMany({ where, include: { quarters: true } });

    const trend = (["Q1", "Q2", "Q3", "Q4"] as const).map((quarter) => {
      const scored = goals
        .filter((g) => g.quarters.find((qu) => qu.quarter === quarter)?.actual != null)
        .map((g) => ({ ...g, quarter: g.quarters.find((qu) => qu.quarter === quarter) ?? null }));
      const score = overallScore(scored);
      return { quarter, score, n: scored.length };
    });
    return { trend };
  });

  app.get("/distribution", { preHandler: app.requireRole(["ADMIN", "MANAGER"]) }, async (req) => {
    const q = req.query as { department?: string };
    const where: Record<string, unknown> = {};
    if (q.department) where.owner = { department: q.department };
    const goals = await app.prisma.goal.findMany({ where, select: { thrustArea: true, uom: true } });
    const thrust = goals.reduce<Record<string, number>>((acc, g) => {
      acc[g.thrustArea] = (acc[g.thrustArea] ?? 0) + 1;
      return acc;
    }, {});
    const uom = goals.reduce<Record<string, number>>((acc, g) => {
      acc[g.uom] = (acc[g.uom] ?? 0) + 1;
      return acc;
    }, {});
    return { thrust, uom, total: goals.length };
  });

  app.get("/manager-effectiveness", { preHandler: app.requireRole(["ADMIN", "MANAGER"]) }, async (req) => {
    const q = req.query as { department?: string };
    const where: Record<string, unknown> = { role: "MANAGER" };
    if (q.department) where.department = q.department;
    const managers = await app.prisma.user.findMany({
      where,
      include: { reports: { include: { goals: { include: { quarters: true } } } } },
    });

    const data = managers.map((m) => {
      const teamGoals = m.reports.flatMap((r) => r.goals);
      const approved = teamGoals.filter((g) => g.approvalStatus === "APPROVED").length;
      const totalApprovals = teamGoals.filter((g) => g.approvalStatus !== "DRAFT").length;
      const approvalRate = totalApprovals ? Math.round((approved / totalApprovals) * 100) : 0;

      // Check-in completion rate across team for current cycle
      const checkinTotals = m.reports.reduce(
        (acc, r) => {
          for (const g of r.goals) {
            for (const q of g.quarters) {
              acc.total++;
              if (q.actual != null) acc.filled++;
            }
          }
          return acc;
        },
        { total: 0, filled: 0 },
      );
      const checkinRate = checkinTotals.total ? Math.round((checkinTotals.filled / checkinTotals.total) * 100) : 0;

      return {
        id: m.id,
        name: m.name,
        department: m.department,
        teamSize: m.reports.length,
        approvalRate,
        checkinRate,
        score: Math.round((approvalRate + checkinRate) / 2),
      };
    });

    return { managers: data.sort((a, b) => b.score - a.score) };
  });

  app.get("/heatmap", { preHandler: app.requireRole(["ADMIN", "MANAGER"]) }, async (req) => {
    const q = req.query as { department?: string };
    const where: Record<string, unknown> = { role: "EMPLOYEE" };
    if (q.department) where.department = q.department;
    const employees = await app.prisma.user.findMany({
      where,
      include: { goals: { include: { quarters: true } } },
    });
    const rows = employees.map((u) => {
      const cells = (["Q1", "Q2", "Q3", "Q4"] as const).map((q) => {
        const total = u.goals.length;
        const filled = u.goals.filter((g) => g.quarters.find((qu) => qu.quarter === q)?.actual != null).length;
        return { quarter: q, pct: total ? Math.round((filled / total) * 100) : 0 };
      });
      return { id: u.id, name: u.name, department: u.department, cells };
    });
    return { rows };
  });
}
