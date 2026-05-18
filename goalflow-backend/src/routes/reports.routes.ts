import type { FastifyInstance } from "fastify";
import { toCsv, toXlsx } from "../lib/csv.js";
import { computeScore, overallScore } from "../lib/score.js";

export async function reportsRoutes(app: FastifyInstance) {
  // Achievement report — Planned vs Actual per employee per goal per quarter
  app.get("/achievement", { preHandler: app.requireRole(["ADMIN", "MANAGER"]) }, async () => {
    const goals = await app.prisma.goal.findMany({
      include: { quarters: true, owner: { select: { id: true, name: true, department: true } } },
    });
    return { rows: goals };
  });

  app.get("/achievement.csv", { preHandler: app.requireRole(["ADMIN", "MANAGER"]) }, async (_req, reply) => {
    const goals = await app.prisma.goal.findMany({
      include: { quarters: true, owner: { select: { name: true, department: true } } },
    });
    const rows = goals.flatMap((g) =>
      (["Q1", "Q2", "Q3", "Q4"] as const).map((q) => {
        const upd = g.quarters.find((x) => x.quarter === q);
        const score = computeScore(g, upd);
        return {
          employee: g.owner.name,
          department: g.owner.department,
          goal: g.title,
          uom: g.uom,
          direction: g.direction,
          target: g.target,
          quarter: q,
          actual: upd?.actual ?? "",
          status: upd?.status ?? "NOT_STARTED",
          score: score.value,
          weightage: g.weightage,
        };
      }),
    );
    const csv = toCsv(rows, [
      { key: "employee", header: "Employee" },
      { key: "department", header: "Department" },
      { key: "goal", header: "Goal" },
      { key: "uom", header: "UoM" },
      { key: "direction", header: "Direction" },
      { key: "target", header: "Target" },
      { key: "quarter", header: "Quarter" },
      { key: "actual", header: "Actual" },
      { key: "status", header: "Status" },
      { key: "score", header: "Score %" },
      { key: "weightage", header: "Weight %" },
    ]);
    reply.header("Content-Type", "text/csv").header("Content-Disposition", 'attachment; filename="achievement.csv"');
    return csv;
  });

  app.get("/achievement.xlsx", { preHandler: app.requireRole(["ADMIN", "MANAGER"]) }, async (_req, reply) => {
    const goals = await app.prisma.goal.findMany({
      include: { quarters: true, owner: { select: { name: true, department: true } } },
    });
    const rows = goals.flatMap((g) =>
      (["Q1", "Q2", "Q3", "Q4"] as const).map((q) => {
        const upd = g.quarters.find((x) => x.quarter === q);
        const score = computeScore(g, upd);
        return {
          employee: g.owner.name,
          department: g.owner.department,
          goal: g.title,
          uom: g.uom,
          direction: g.direction,
          target: g.target,
          quarter: q,
          actual: upd?.actual ?? "",
          status: upd?.status ?? "NOT_STARTED",
          score: score.value,
          weightage: g.weightage,
        };
      }),
    );
    const buf = await toXlsx(
      rows,
      [
        { key: "employee", header: "Employee", width: 22 },
        { key: "department", header: "Department", width: 18 },
        { key: "goal", header: "Goal", width: 38 },
        { key: "uom", header: "UoM", width: 12 },
        { key: "direction", header: "Direction", width: 10 },
        { key: "target", header: "Target", width: 10 },
        { key: "quarter", header: "Quarter", width: 8 },
        { key: "actual", header: "Actual", width: 10 },
        { key: "status", header: "Status", width: 14 },
        { key: "score", header: "Score %", width: 10 },
        { key: "weightage", header: "Weight %", width: 10 },
      ],
      "Achievement",
    );
    reply
      .header("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
      .header("Content-Disposition", 'attachment; filename="achievement.xlsx"');
    return buf;
  });

  app.get("/completion", { preHandler: app.requireRole(["ADMIN", "MANAGER"]) }, async () => {
    const employees = await app.prisma.user.findMany({ where: { role: "EMPLOYEE" }, include: { goals: { include: { quarters: true } } } });
    const completion = employees.map((u) => {
      const quarterStats = (["Q1", "Q2", "Q3", "Q4"] as const).map((q) => {
        const total = u.goals.length;
        const filled = u.goals.filter((g) => g.quarters.find((x) => x.quarter === q)?.actual != null).length;
        return { quarter: q, total, filled, pct: total ? Math.round((filled / total) * 100) : 0 };
      });
      return { user: { id: u.id, name: u.name, department: u.department }, quarters: quarterStats };
    });
    return { completion };
  });
}
