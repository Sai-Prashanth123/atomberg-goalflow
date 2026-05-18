import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, downloadFile, setAuthToken } from "./client";
import type {
  AuditEntry,
  Cycle,
  EscalationRule,
  Goal,
  Notification,
  Quarter,
  User,
} from "./types";

// ─── Auth ────────────────────────────────────────────────────────────────────

export function useMe() {
  return useQuery({
    queryKey: ["me"],
    queryFn: () => api<{ user: User | null }>("/auth/me").then((r) => r.user),
    retry: false,
    staleTime: 30_000,
  });
}

export function useLogin() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { email: string; password: string }) =>
      api<{ user: User; token: string }>("/auth/login", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: (data) => {
      setAuthToken(data.token);
      qc.setQueryData(["me"], data.user);
    },
  });
}

// Real SSO uses Supabase Auth on the frontend + token-exchange POST to /auth/sso/microsoft.
// This hook remains for backwards-compat (mock email-only path used in tests).
export function useMockSso() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { email: string; name?: string }) =>
      api<{ user: User; token: string }>("/auth/sso/microsoft", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: (data) => {
      setAuthToken(data.token);
      qc.setQueryData(["me"], data.user);
    },
  });
}

export function useLogout() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api("/auth/logout", { method: "POST" }),
    onSuccess: () => {
      setAuthToken(null);
      qc.setQueryData(["me"], null);
      qc.clear();
    },
    onError: () => {
      // Even if the logout call fails (e.g. network), clear local state.
      setAuthToken(null);
    },
  });
}

// ─── Users ───────────────────────────────────────────────────────────────────

export function useUsers() {
  return useQuery({
    queryKey: ["users"],
    queryFn: () => api<{ users: User[] }>("/users").then((r) => r.users),
  });
}

export function useTeam() {
  return useQuery({
    queryKey: ["team"],
    queryFn: () => api<{ team: User[] }>("/users/team").then((r) => r.team),
  });
}

export type SyncHierarchyResult = {
  ok: boolean;
  note: string;
  total: number;
  withManager: number;
  missing: Array<{ id: string; name: string; email: string; role: string }>;
};

export function useSyncHierarchy() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api<SyncHierarchyResult>("/users/sync-hierarchy", { method: "POST" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["users"] });
      qc.invalidateQueries({ queryKey: ["audit"] });
    },
  });
}

export function useUser(id: string | undefined) {
  return useQuery({
    queryKey: ["user", id],
    queryFn: () => api<{ user: User }>(`/users/${id}`).then((r) => r.user),
    enabled: !!id,
  });
}

export function useCreateUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { email: string; name: string; password: string; role: "EMPLOYEE" | "MANAGER" | "ADMIN"; department: string; managerId?: string | null }) =>
      api<{ user: User }>("/users", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["users"] });
      qc.invalidateQueries({ queryKey: ["audit"] });
    },
  });
}

export function useUpdateUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: { name?: string; role?: "EMPLOYEE" | "MANAGER" | "ADMIN"; department?: string; managerId?: string | null } }) =>
      api<{ user: User }>(`/users/${id}`, { method: "PATCH", body: JSON.stringify(patch) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["users"] });
      qc.invalidateQueries({ queryKey: ["audit"] });
    },
  });
}

// ─── Cycles ──────────────────────────────────────────────────────────────────

export function useCycles() {
  return useQuery({
    queryKey: ["cycles"],
    queryFn: () => api<{ cycles: Cycle[] }>("/cycles").then((r) => r.cycles),
  });
}

export function useActiveCycle() {
  return useQuery({
    queryKey: ["cycles", "active"],
    queryFn: () => api<{ cycle: Cycle | null }>("/cycles/active").then((r) => r.cycle),
    staleTime: 60_000,
  });
}

export function useTransitionCycle() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: "UPCOMING" | "ACTIVE" | "CLOSED" }) =>
      api<{ cycle: Cycle }>(`/cycles/${id}/transition`, { method: "PATCH", body: JSON.stringify({ status }) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["cycles"] }),
  });
}

export function useCreateCycle() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { name: string; kind: "GOAL_SETTING" | "Q1" | "Q2" | "Q3" | "Q4"; openDate: string; closeDate: string; fiscalYear: string }) =>
      api<{ cycle: Cycle }>("/cycles", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["cycles"] }),
  });
}

export function useUpdateCycle() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Partial<{ name: string; kind: "GOAL_SETTING" | "Q1" | "Q2" | "Q3" | "Q4"; openDate: string; closeDate: string; fiscalYear: string }> }) =>
      api<{ cycle: Cycle }>(`/cycles/${id}`, { method: "PATCH", body: JSON.stringify(patch) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["cycles"] });
      qc.invalidateQueries({ queryKey: ["audit"] });
    },
  });
}

// ─── Goals ───────────────────────────────────────────────────────────────────

export function useGoals(filter?: { ownerId?: string; teamOf?: string; mine?: boolean }) {
  const qs = new URLSearchParams();
  if (filter?.mine) qs.set("mine", "1");
  if (filter?.ownerId) qs.set("ownerId", filter.ownerId);
  if (filter?.teamOf) qs.set("teamOf", filter.teamOf);
  return useQuery({
    queryKey: ["goals", filter],
    queryFn: () => api<{ goals: Goal[] }>(`/goals?${qs}`).then((r) => r.goals),
  });
}

export function useCreateGoal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Partial<Goal>) => api<{ goal: Goal }>("/goals", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["goals"] }),
  });
}

export function useUpdateGoal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Partial<Goal> }) =>
      api<{ goal: Goal }>(`/goals/${id}`, { method: "PATCH", body: JSON.stringify(patch) }),
    // Optimistic update so inline weightage/target edits feel instant on the
    // manager team page. The query refetches on settled so server-side
    // normalization (direction reset for ZERO_BASED/TIMELINE) syncs back.
    onMutate: async ({ id, patch }) => {
      await qc.cancelQueries({ queryKey: ["goals"] });
      const snapshots: Array<[unknown, unknown]> = [];
      const queries = qc.getQueriesData<Goal[]>({ queryKey: ["goals"] });
      for (const [key, data] of queries) {
        if (!data) continue;
        snapshots.push([key, data]);
        qc.setQueryData<Goal[]>(key, (old) => (old ? old.map((g) => (g.id === id ? { ...g, ...patch } : g)) : old));
      }
      return { snapshots };
    },
    onError: (_err, _vars, ctx) => {
      const snapshots = (ctx as { snapshots?: Array<[unknown, unknown]> } | undefined)?.snapshots;
      if (snapshots) for (const [key, data] of snapshots) qc.setQueryData(key as readonly unknown[], data);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ["goals"] }),
  });
}

export function useDeleteGoal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api(`/goals/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["goals"] }),
  });
}

export function useSubmitGoals() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api<{ submitted: number }>("/goals/submit", { method: "POST" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["goals"] }),
  });
}

export function useApproveGoal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api<{ goal: Goal }>(`/goals/${id}/approve`, { method: "PATCH" }),
    onMutate: async (id: string) => {
      await qc.cancelQueries({ queryKey: ["goals"] });
      const snapshots: Array<[unknown, unknown]> = [];
      const queries = qc.getQueriesData<Goal[]>({ queryKey: ["goals"] });
      for (const [key, data] of queries) {
        if (!data) continue;
        snapshots.push([key, data]);
        qc.setQueryData<Goal[]>(key, (old) =>
          old ? old.map((g) => (g.id === id ? { ...g, approvalStatus: "APPROVED" as const, locked: true } : g)) : old,
        );
      }
      return { snapshots };
    },
    onError: (_err, _id, ctx) => {
      const snapshots = (ctx as { snapshots?: Array<[unknown, unknown]> } | undefined)?.snapshots;
      if (snapshots) for (const [key, data] of snapshots) qc.setQueryData(key as readonly unknown[], data);
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["goals"] });
      qc.invalidateQueries({ queryKey: ["audit"] });
    },
  });
}

export function useReturnGoal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      api<{ goal: Goal }>(`/goals/${id}/return`, { method: "PATCH", body: JSON.stringify({ reason }) }),
    onMutate: async ({ id, reason }) => {
      await qc.cancelQueries({ queryKey: ["goals"] });
      const snapshots: Array<[unknown, unknown]> = [];
      const queries = qc.getQueriesData<Goal[]>({ queryKey: ["goals"] });
      for (const [key, data] of queries) {
        if (!data) continue;
        snapshots.push([key, data]);
        qc.setQueryData<Goal[]>(key, (old) =>
          old ? old.map((g) => (g.id === id ? { ...g, approvalStatus: "RETURNED" as const, returnReason: reason } : g)) : old,
        );
      }
      return { snapshots };
    },
    onError: (_err, _vars, ctx) => {
      const snapshots = (ctx as { snapshots?: Array<[unknown, unknown]> } | undefined)?.snapshots;
      if (snapshots) for (const [key, data] of snapshots) qc.setQueryData(key as readonly unknown[], data);
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["goals"] });
      qc.invalidateQueries({ queryKey: ["audit"] });
    },
  });
}

export function useUnlockGoal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api<{ goal: Goal }>(`/goals/${id}/unlock`, { method: "POST" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["goals"] });
      qc.invalidateQueries({ queryKey: ["audit"] });
    },
  });
}

export function useUpdateQuarter() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ goalId, q, patch }: { goalId: string; q: Quarter; patch: { actual?: number | null; status?: string; note?: string | null } }) =>
      api(`/goals/${goalId}/quarter/${q}`, { method: "PATCH", body: JSON.stringify(patch) }),
    // Optimistic update: instantly apply the patch to every cached goal list
    // so chips/inputs update without waiting for the server roundtrip.
    onMutate: async ({ goalId, q, patch }) => {
      await qc.cancelQueries({ queryKey: ["goals"] });
      const snapshots: Array<[unknown, unknown]> = [];
      const queries = qc.getQueriesData<Goal[]>({ queryKey: ["goals"] });
      for (const [key, data] of queries) {
        if (!data) continue;
        snapshots.push([key, data]);
        qc.setQueryData<Goal[]>(key, (old) => {
          if (!old) return old;
          return old.map((g) => {
            if (g.id !== goalId) return g;
            const quarters = g.quarters.map((qu) =>
              qu.quarter === q
                ? {
                    ...qu,
                    ...("actual" in patch ? { actual: patch.actual ?? null } : {}),
                    ...("status" in patch ? { status: patch.status as Goal["quarters"][number]["status"] } : {}),
                    ...("note" in patch ? { note: patch.note ?? null } : {}),
                  }
                : qu,
            );
            return { ...g, quarters };
          });
        });
      }
      return { snapshots };
    },
    onError: (_err, _vars, ctx) => {
      // Roll back to the snapshot on failure so the UI matches reality.
      const snapshots = (ctx as { snapshots?: Array<[unknown, unknown]> } | undefined)?.snapshots;
      if (snapshots) {
        for (const [key, data] of snapshots) qc.setQueryData(key as readonly unknown[], data);
      }
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ["goals"] }),
  });
}

// ─── Shared goals ────────────────────────────────────────────────────────────

export function usePushSharedGoal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      title: string;
      description: string;
      uom: string;
      direction?: string;
      target: number;
      thrustArea: string;
      primaryOwnerId: string;
      recipientIds: string[];
      weightagePerRecipient?: number;
    }) => api("/shared-goals", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["goals"] });
      qc.invalidateQueries({ queryKey: ["audit"] });
    },
  });
}

// ─── Notifications ───────────────────────────────────────────────────────────

export function useNotifications() {
  return useQuery({
    queryKey: ["notifications"],
    queryFn: () => api<{ notifications: Notification[] }>("/notifications").then((r) => r.notifications),
    refetchInterval: 30_000,
  });
}

export function useMarkAllRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api("/notifications/read-all", { method: "POST" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notifications"] }),
  });
}

// ─── Audit ───────────────────────────────────────────────────────────────────

export function useAuditLog(filters?: { user?: string; action?: string; postLock?: boolean }) {
  const qs = new URLSearchParams();
  if (filters?.user) qs.set("user", filters.user);
  if (filters?.action) qs.set("action", filters.action);
  if (filters?.postLock) qs.set("postLock", "true");
  return useQuery({
    queryKey: ["audit", filters],
    queryFn: () => api<{ entries: AuditEntry[] }>(`/audit?${qs}`).then((r) => r.entries),
  });
}

export function downloadAuditCsv() {
  return downloadFile("/audit/export.csv", "audit.csv");
}

// ─── Reports + Analytics ─────────────────────────────────────────────────────

export function downloadAchievementCsv() {
  return downloadFile("/reports/achievement.csv", "achievement.csv");
}
export function downloadAchievementXlsx() {
  return downloadFile("/reports/achievement.xlsx", "achievement.xlsx");
}

export function useCompletionReport() {
  return useQuery({
    queryKey: ["reports", "completion"],
    queryFn: () => api<{ completion: Array<{ user: { id: string; name: string; department: string }; quarters: Array<{ quarter: Quarter; pct: number; filled: number; total: number }> }> }>("/reports/completion").then((r) => r.completion),
  });
}

export function useQoQ(filter?: { department?: string; userId?: string }) {
  const qs = new URLSearchParams();
  if (filter?.department) qs.set("department", filter.department);
  if (filter?.userId) qs.set("userId", filter.userId);
  return useQuery({
    queryKey: ["analytics", "qoq", filter],
    queryFn: () => api<{ trend: Array<{ quarter: Quarter; score: number; n: number }> }>(`/analytics/qoq?${qs}`).then((r) => r.trend),
  });
}

export function useDistribution(filter?: { department?: string }) {
  const qs = new URLSearchParams();
  if (filter?.department) qs.set("department", filter.department);
  const suffix = qs.toString() ? `?${qs}` : "";
  return useQuery({
    queryKey: ["analytics", "distribution", filter],
    queryFn: () => api<{ thrust: Record<string, number>; uom: Record<string, number>; total: number }>(`/analytics/distribution${suffix}`),
  });
}

export function useManagerEffectiveness(filter?: { department?: string }) {
  const qs = new URLSearchParams();
  if (filter?.department) qs.set("department", filter.department);
  const suffix = qs.toString() ? `?${qs}` : "";
  return useQuery({
    queryKey: ["analytics", "manager-effectiveness", filter],
    queryFn: () => api<{ managers: Array<{ id: string; name: string; department: string; teamSize: number; approvalRate: number; checkinRate: number; score: number }> }>(`/analytics/manager-effectiveness${suffix}`).then((r) => r.managers),
  });
}

export function useHeatmap(filter?: { department?: string }) {
  const qs = new URLSearchParams();
  if (filter?.department) qs.set("department", filter.department);
  const suffix = qs.toString() ? `?${qs}` : "";
  return useQuery({
    queryKey: ["analytics", "heatmap", filter],
    queryFn: () => api<{ rows: Array<{ id: string; name: string; department: string; cells: Array<{ quarter: Quarter; pct: number }> }> }>(`/analytics/heatmap${suffix}`).then((r) => r.rows),
  });
}

// ─── Escalation ──────────────────────────────────────────────────────────────

export function useEscalationRules() {
  return useQuery({
    queryKey: ["escalation", "rules"],
    queryFn: () => api<{ rules: EscalationRule[] }>("/escalation/rules").then((r) => r.rules),
  });
}

export type EscalationRuleInput = {
  name: string;
  trigger: "GOAL_NOT_SUBMITTED" | "APPROVAL_PENDING" | "CHECKIN_INCOMPLETE";
  thresholdDays: number;
  enabled?: boolean;
};

export function useCreateEscalationRule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: EscalationRuleInput) =>
      api<{ rule: EscalationRule }>("/escalation/rules", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["escalation", "rules"] });
      qc.invalidateQueries({ queryKey: ["audit"] });
    },
  });
}

export function useUpdateEscalationRule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Partial<EscalationRuleInput> }) =>
      api<{ rule: EscalationRule }>(`/escalation/rules/${id}`, { method: "PATCH", body: JSON.stringify(patch) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["escalation", "rules"] });
      qc.invalidateQueries({ queryKey: ["audit"] });
    },
  });
}

export function useDeleteEscalationRule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      api<{ ok: boolean }>(`/escalation/rules/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["escalation", "rules"] });
      qc.invalidateQueries({ queryKey: ["audit"] });
    },
  });
}

export type EscalationEvent = {
  id: string;
  ruleId: string;
  level: number;
  reason: string;
  resolved: boolean;
  createdAt: string;
  rule: { id: string; name: string; trigger: string; thresholdDays: number };
  target: { id: string; name: string };
  escalatedTo: { id: string; name: string };
};

export function useEscalationEvents() {
  return useQuery({
    queryKey: ["escalation", "events"],
    queryFn: () => api<{ events: EscalationEvent[] }>("/escalation/events").then((r) => r.events),
  });
}

export function useTickEscalation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api("/escalation/tick", { method: "POST" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["notifications"] });
      qc.invalidateQueries({ queryKey: ["audit"] });
      qc.invalidateQueries({ queryKey: ["escalation", "events"] });
    },
  });
}

export function useResolveEscalation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      api<{ event: EscalationEvent }>(`/escalation/events/${id}/resolve`, { method: "PATCH" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["escalation", "events"] });
      qc.invalidateQueries({ queryKey: ["audit"] });
    },
  });
}
