// UI-only Zustand store. Server data lives in React Query.
// Currentuser is hydrated at app boot from /auth/me and on login mutation success.

import { create } from "zustand";
import type {
  User,
  Goal,
  QuarterUpdate,
  Quarter,
  Role,
  UoM,
  Direction,
  GoalStatus,
  ApprovalStatus,
  ThrustArea,
} from "@/api/types";
import {
  THRUST_AREAS as THRUST_ENUM,
  UOMS,
  THRUST_LABEL,
  UOM_LABEL,
  STATUS_LABEL,
  APPROVAL_LABEL,
} from "@/api/types";

interface Store {
  currentUser: User | null;
  notificationsOpen: boolean;
  setCurrentUser: (u: User | null) => void;
  setNotificationsOpen: (v: boolean) => void;
}

export const useStore = create<Store>((set) => ({
  currentUser: null,
  notificationsOpen: false,
  setCurrentUser: (u) => set({ currentUser: u }),
  setNotificationsOpen: (v) => set({ notificationsOpen: v }),
}));

// Re-export domain types so older route imports keep working.
export type { User, Goal, QuarterUpdate, Quarter, Role, UoM, Direction, GoalStatus, ApprovalStatus, ThrustArea };
export { THRUST_ENUM as THRUST_AREAS, UOMS, THRUST_LABEL, UOM_LABEL, STATUS_LABEL, APPROVAL_LABEL };

// BRD §2.2 — System-computed progress scores (for tracking only, not ratings).
//
// | UoM Type                | Formula                  |
// | ----------------------- | ------------------------ |
// | Min (Numeric / %)       | Achievement ÷ Target     |
// | Max (Numeric / %)       | Target ÷ Achievement     |
// | Timeline                | Completion vs Deadline   |
// | Zero                    | 0 → 100% else 0%         |
//
// IMPORTANT: this logic MUST stay in sync with `goalflow-backend/src/lib/score.ts`.
// Backend `value` is used in CSV/Excel exports; this `value` is what the UI shows.
// Branch-for-branch parity is required for audit trust.
export function computeScore(
  g: Pick<Goal, "uom" | "direction" | "target">,
  q: { actual?: number | null } | Quarter,
): { value: number; display: string; ok: boolean } {
  // Allow being called with either an update object or a quarter key + goal+quarters
  if (typeof q === "string") {
    return { value: 0, display: "—", ok: false };
  }
  if (q.actual == null) return { value: 0, display: "—", ok: false };
  const actual = q.actual;
  const target = g.target;

  // BRD §2.2 — Zero: "If 0 → 100%, else 0%"
  if (g.uom === "ZERO_BASED") {
    return actual === 0 ? { value: 100, display: "100% ✓", ok: true } : { value: 0, display: "0%", ok: false };
  }
  // BRD §2.2 — Timeline: "Completion date vs Deadline"
  if (g.uom === "TIMELINE") {
    if (target === 0) return { value: 0, display: "—", ok: false };
    const diff = target - actual;
    if (diff >= 0) return { value: 100, display: "On Time", ok: true };
    // partial credit linearly until 100% late = 0 score
    const lateDays = Math.abs(diff);
    const pct = Math.max(0, Math.round(100 + (diff / target) * 100));
    return { value: pct, display: `${pct}% (${lateDays}d late)`, ok: pct >= 80 };
  }
  // BRD §2.2 — Max (Numeric/%): "Target ÷ Achievement" (lower-is-better)
  //          — Min (Numeric/%): "Achievement ÷ Target" (higher-is-better)
  // No cap at 100% — BRD says "tracking only, not ratings".
  if (target === 0) return { value: 0, display: "—", ok: false };
  // Guard MAX against actual=0 (would otherwise yield Infinity).
  if (g.direction === "MAX" && actual === 0) {
    return { value: 0, display: "—", ok: false };
  }
  const ratio = g.direction === "MAX" ? target / actual : actual / target;
  const pct = Math.round(ratio * 100);
  return { value: Math.max(0, pct), display: `${pct}%`, ok: pct >= 80 };
}

export function computeQuarterScore(
  g: Pick<Goal, "uom" | "direction" | "target" | "quarters">,
  q: Quarter,
): { value: number; display: string; ok: boolean } {
  const upd = g.quarters.find((x) => x.quarter === q);
  return computeScore(g, { actual: upd?.actual ?? null });
}

export function overallScore(goals: Goal[], q: Quarter = "Q2"): number {
  const total = goals.reduce((s, g) => s + g.weightage, 0);
  if (!total) return 0;
  const weighted = goals.reduce((s, g) => s + computeQuarterScore(g, q).value * g.weightage, 0);
  return Math.round(weighted / total);
}
