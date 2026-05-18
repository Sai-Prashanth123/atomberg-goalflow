// BRD §2.2 — System-computed progress scores (for tracking only, not ratings).
//
// | UoM Type                | Description                           | Formula                  |
// | ----------------------- | ------------------------------------- | ------------------------ |
// | Min (Numeric / %)       | Higher is better — e.g. Sales Revenue | Achievement ÷ Target     |
// | Max (Numeric / %)       | Lower is better — e.g. TAT, Cost      | Target ÷ Achievement     |
// | Timeline                | Date-based completion                 | Completion vs Deadline   |
// | Zero                    | Zero = Success — e.g. Safety          | 0 → 100% else 0%         |
//
// IMPORTANT: this file's logic MUST match `goalflow-atomberg-hub/src/lib/store.ts`
// `computeScore()` branch-for-branch. The CSV/Excel export uses backend `value`;
// the UI uses frontend `value`; they have to agree for audit trust.

import type { Direction, UoM, Goal, QuarterUpdate } from "@prisma/client";

export type ScoreResult = {
  value: number;
  display: string;
  ok: boolean;
};

export function computeScore(
  goal: Pick<Goal, "uom" | "direction" | "target">,
  update: Pick<QuarterUpdate, "actual"> | null | undefined,
): ScoreResult {
  if (!update || update.actual === null || update.actual === undefined) {
    return { value: 0, display: "—", ok: false };
  }
  const actual = update.actual;
  const target = goal.target;

  switch (goal.uom) {
    case "ZERO_BASED":
      // BRD §2.2 — Zero: "If 0 → 100%, else 0%"
      return actual === 0
        ? { value: 100, display: "100% ✓", ok: true }
        : { value: 0, display: "0%", ok: false };

    case "TIMELINE": {
      // BRD §2.2 — Timeline: "Completion date vs Deadline".
      // Target & actual are number-of-days. Lower actual = earlier completion.
      // On time → 100%; late → linear penalty toward 0 across one full target period.
      if (target === 0) return { value: 0, display: "—", ok: false };
      const diff = target - actual;
      if (diff >= 0) return { value: 100, display: "On Time", ok: true };
      const lateDays = Math.abs(diff);
      const pct = Math.max(0, Math.round(100 + (diff / target) * 100));
      return { value: pct, display: `${pct}% (${lateDays}d late)`, ok: pct >= 80 };
    }

    case "NUMERIC":
    case "PERCENTAGE": {
      // BRD §2.2 — Max (Numeric/%): "Target ÷ Achievement" (lower-is-better)
      //          — Min (Numeric/%): "Achievement ÷ Target" (higher-is-better)
      // No cap at 100% — BRD calls these "tracking, not ratings", so an overshoot
      // (e.g., 111%) is legitimate signal.
      if (target === 0) return { value: 0, display: "—", ok: false };
      // Guard MAX direction against actual=0 (would otherwise yield Infinity).
      // Treat as "no comparable data" — let the manager note explain context.
      if (goal.direction === "MAX" && actual === 0) {
        return { value: 0, display: "—", ok: false };
      }
      const ratio = goal.direction === "MAX" ? target / actual : actual / target;
      const pct = Math.round(ratio * 100);
      return { value: Math.max(0, pct), display: `${pct}%`, ok: pct >= 80 };
    }
  }
}

export function overallScore(
  goals: Array<Pick<Goal, "uom" | "direction" | "target" | "weightage"> & { quarter: Pick<QuarterUpdate, "actual"> | null }>,
): number {
  const totalWeight = goals.reduce((s, g) => s + g.weightage, 0);
  if (totalWeight === 0) return 0;
  const weighted = goals.reduce((s, g) => s + computeScore(g, g.quarter).value * g.weightage, 0);
  return Math.round(weighted / totalWeight);
}
