import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useStore, overallScore, computeScore } from "@/lib/store";
import { useTeam, useGoals, useActiveCycle } from "@/api/hooks";
import type { Goal, Quarter } from "@/api/types";
import { guardRoute } from "@/lib/auth-guard";
import { Bento, Eyebrow, GoldBar, Input, Metric, OutlineButton, StatusBadge, Chip } from "@/components/ui-kit";
import { SkeletonMetricGrid, SkeletonTable, RouteError } from "@/components/Skeleton";
import { Search, AlertTriangle, Users } from "lucide-react";

// BRD §1 pain point B — managers need real-time visibility into AT-RISK work,
// not just average team progress. A goal is at-risk in the active quarter when
// it's APPROVED (so it's live) AND either the actual hasn't been logged or the
// computed score is below 60% of target.
function atRiskCount(goals: Goal[], q: Quarter): number {
  return goals.filter((g) => {
    if (g.approvalStatus !== "APPROVED") return false;
    const upd = g.quarters.find((x) => x.quarter === q);
    if (upd?.actual == null) return true;
    const score = computeScore(g, { actual: upd.actual });
    return score.value < 60;
  }).length;
}

export const Route = createFileRoute("/manager/dashboard")({
  beforeLoad: ({ context }) => guardRoute(context, ["MANAGER", "ADMIN"]),
  component: ManagerDashboard,
  errorComponent: ({ error, reset }) => <RouteError error={error} reset={reset} />,
});

function ManagerDashboard() {
  const me = useStore((s) => s.currentUser!);
  const teamQ = useTeam();
  const goalsQ = useGoals({ teamOf: me.id });
  const activeCycleQ = useActiveCycle();
  const team = teamQ.data ?? [];
  const allGoals = goalsQ.data ?? [];
  const activeCycle = activeCycleQ.data;
  const activeQuarter: Quarter =
    activeCycle?.kind && ["Q1", "Q2", "Q3", "Q4"].includes(activeCycle.kind)
      ? (activeCycle.kind as Quarter)
      : "Q2";
  const [filter, setFilter] = useState<"All" | "Pending" | "CheckinDue" | "AtRisk" | "Completed">("All");
  const [q, setQ] = useState("");

  if (teamQ.isPending || goalsQ.isPending) {
    return (
      <div className="space-y-4">
        <h1 className="font-display text-3xl font-bold">Team Overview</h1>
        <SkeletonMetricGrid items={4} />
        <SkeletonTable rows={5} cols={5} />
      </div>
    );
  }

  const pendingCount = allGoals.filter((g) => g.approvalStatus === "PENDING").length;
  const teamProgress = team.length
    ? Math.round(team.reduce((s, u) => s + overallScore(allGoals.filter((g) => g.ownerId === u.id), activeQuarter), 0) / team.length)
    : 0;
  // Team members whose APPROVED goals still have a missing actual in the active quarter.
  const checkinsDueCount = team.filter((u) => {
    const ug = allGoals.filter((g) => g.ownerId === u.id && g.approvalStatus === "APPROVED");
    if (ug.length === 0) return false;
    return ug.some((g) => g.quarters.find((x) => x.quarter === activeQuarter)?.actual == null);
  }).length;
  // Team-wide at-risk goals in the active quarter (BRD §1 pain point B).
  const atRiskTotal = atRiskCount(allGoals, activeQuarter);

  // Pre-compute at-risk per employee so we can both filter + sort by it.
  const teamWithRisk = team.map((u) => {
    const ug = allGoals.filter((g) => g.ownerId === u.id);
    return { user: u, goals: ug, risk: atRiskCount(ug, activeQuarter) };
  });
  // Sort by risk desc so hotspots float to the top (BRD §1 — managers spot slipping work fast).
  teamWithRisk.sort((a, b) => b.risk - a.risk);

  const filtered = teamWithRisk.filter(({ user: u, goals: ug, risk }) => {
    if (q && !u.name.toLowerCase().includes(q.toLowerCase())) return false;
    if (filter === "Pending") return ug.some((g) => g.approvalStatus === "PENDING");
    if (filter === "CheckinDue") return ug.some((g) => g.approvalStatus === "APPROVED" && g.quarters.find((x) => x.quarter === activeQuarter)?.actual == null);
    if (filter === "AtRisk") return risk > 0;
    if (filter === "Completed") return ug.length > 0 && ug.every((g) => g.approvalStatus === "APPROVED");
    return true;
  });

  if (team.length === 0) {
    return (
      <div className="space-y-4">
        <h1 className="font-display text-3xl font-bold">Team Overview</h1>
        <Bento className="p-12 text-center">
          <Users className="h-10 w-10 text-gold mx-auto mb-3 opacity-70" />
          <h3 className="font-display font-bold mb-1">No direct reports yet</h3>
          <p className="text-sm text-muted-foreground max-w-md mx-auto">
            You don't have anyone reporting to you in the system right now. An Admin
            can assign reports via <span className="text-foreground font-medium">Admin Control → Org Hierarchy</span>.
          </p>
        </Bento>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h1 className="font-display text-3xl font-bold">Team Overview</h1>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Bento className="p-5"><Eyebrow>Team Size</Eyebrow><Metric value={team.length} /></Bento>
        <Bento className="p-5"><Eyebrow>Pending Approvals</Eyebrow><div className="flex items-baseline gap-2 mt-1"><Metric value={pendingCount} /><span className="text-[10px] uppercase tracking-widest text-gold">awaiting</span></div></Bento>
        <Bento className="p-5"><Eyebrow>Check-ins Due — {activeQuarter}</Eyebrow><div className="flex items-baseline gap-2 mt-1"><Metric value={checkinsDueCount} /><span className="text-[10px] uppercase tracking-widest text-muted-foreground">of {team.length}</span></div></Bento>
        <Bento className={`p-5 ${atRiskTotal > 0 ? "border-l-2 border-l-destructive" : ""}`}>
          <Eyebrow>At-Risk Goals — {activeQuarter}</Eyebrow>
          <div className="flex items-baseline gap-2 mt-1">
            <span className={`font-mono text-3xl font-bold ${atRiskTotal > 0 ? "text-destructive" : "text-muted-foreground"}`}>{atRiskTotal}</span>
            <span className="text-[10px] uppercase tracking-widest text-muted-foreground">missing or &lt;60%</span>
          </div>
        </Bento>
        <Bento className="p-5"><Eyebrow>Avg Team Progress</Eyebrow><Metric value={teamProgress} suffix="%" /><div className="mt-3"><GoldBar value={teamProgress} /></div></Bento>
      </div>

      <Bento className="overflow-hidden">
        <div className="p-4 border-b border-line flex items-center justify-between gap-4 flex-wrap">
          <div className="flex gap-2 flex-wrap">
            {(["All", "Pending", "CheckinDue", "AtRisk", "Completed"] as const).map((f) => (
              <Chip key={f} active={filter === f} onClick={() => setFilter(f)}>
                {f === "CheckinDue"
                  ? "Check-in Due"
                  : f === "Pending"
                  ? "Pending Approval"
                  : f === "AtRisk"
                  ? `At-Risk${atRiskTotal > 0 ? ` (${atRiskTotal})` : ""}`
                  : f}
              </Chip>
            ))}
          </div>
          <div className="relative w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input className="pl-9" placeholder="Search team…" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
        </div>
        <table className="w-full text-left">
          <thead className="bg-background">
            <tr className="text-[10px] tracking-widest uppercase text-muted-foreground">
              <th className="px-4 py-3 font-medium">Member</th>
              <th className="px-4 py-3 font-medium">Goals</th>
              <th className="px-4 py-3 font-medium">At-Risk</th>
              <th className="px-4 py-3 font-medium">Progress</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(({ user: u, goals: ug, risk }, i) => {
              const prog = overallScore(ug, activeQuarter);
              const pending = ug.some((g) => g.approvalStatus === "PENDING");
              return (
                <tr key={u.id} className={`${i % 2 ? "bg-off-black" : "bg-card-bg"} hover:bg-muted transition ${risk > 0 ? "border-l-2 border-l-destructive/60" : ""}`}>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="h-9 w-9 bg-gold/10 border border-gold/30 flex items-center justify-center text-gold font-display font-bold text-sm">
                        {u.name.split(" ").map((p) => p[0]).join("")}
                      </div>
                      <div>
                        <div className="text-sm font-medium">{u.name}</div>
                        <div className="text-[11px] text-muted-foreground">{u.department} · {u.role}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 font-mono text-gold text-sm">{ug.length}</td>
                  <td className="px-4 py-3">
                    {risk > 0 ? (
                      <span className="inline-flex items-center gap-1.5 text-xs">
                        <AlertTriangle className="h-3.5 w-3.5 text-destructive" />
                        <span className="font-mono text-destructive font-medium">{risk}</span>
                      </span>
                    ) : (
                      <span className="text-xs text-muted-foreground/60">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 w-48">
                    <div className="flex items-center gap-3">
                      <div className="flex-1"><GoldBar value={prog} /></div>
                      <span className="font-mono text-xs text-gold w-10 text-right">{prog}%</span>
                    </div>
                  </td>
                  <td className="px-4 py-3"><StatusBadge status={pending ? "PENDING" : "APPROVED"} /></td>
                  <td className="px-4 py-3 text-right">
                    <Link to="/manager/team/$employeeId" params={{ employeeId: u.id }}>
                      <OutlineButton className="text-xs py-1.5 px-3">Review</OutlineButton>
                    </Link>
                  </td>
                </tr>
              );
            })}
            {filtered.length === 0 && <tr><td colSpan={6} className="p-6 text-center text-sm text-muted-foreground">No team members match the filter.</td></tr>}
          </tbody>
        </table>
      </Bento>
    </div>
  );
}
