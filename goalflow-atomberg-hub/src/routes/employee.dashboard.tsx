import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useStore, overallScore } from "@/lib/store";
import { guardRoute } from "@/lib/auth-guard";
import { useGoals, useSubmitGoals, useActiveCycle, useUsers } from "@/api/hooks";
import { Bento, CircularProgress, Eyebrow, GoldBar, GoldButton, Metric, OutlineButton } from "@/components/ui-kit";
import { GoalModal, GoalRow } from "@/components/goal-bits";
import { SkeletonMetricGrid, SkeletonTable, RouteError } from "@/components/Skeleton";
import { CheckCircle2, AlertTriangle, Plus, AlertCircle, Clock } from "lucide-react";

export const Route = createFileRoute("/employee/dashboard")({
  beforeLoad: ({ context }) => guardRoute(context, ["EMPLOYEE"]),
  component: EmployeeDashboard,
  errorComponent: ({ error, reset }) => <RouteError error={error} reset={reset} />,
});

function EmployeeDashboard() {
  const user = useStore((s) => s.currentUser!);
  const goalsQ = useGoals({ mine: true });
  const goals = goalsQ.data ?? [];
  const activeCycle = useActiveCycle().data;
  const usersQ = useUsers();
  const manager = user.managerId ? usersQ.data?.find((u) => u.id === user.managerId) : null;
  const submit = useSubmitGoals();
  const [modal, setModal] = useState(false);
  const [submitMsg, setSubmitMsg] = useState<string | null>(null);

  // BRD §1 — give the employee visibility into the approval queue so submission
  // isn't a black box. Compute "days waiting" from the oldest pending submittedAt.
  const pendingGoals = goals.filter((g) => g.approvalStatus === "PENDING");
  const oldestSubmittedAt = pendingGoals.reduce<Date | null>((oldest, g) => {
    if (!g.submittedAt) return oldest;
    const t = new Date(g.submittedAt);
    return oldest && oldest < t ? oldest : t;
  }, null);
  const daysWaiting = oldestSubmittedAt
    ? Math.max(0, Math.floor((Date.now() - oldestSubmittedAt.getTime()) / (1000 * 60 * 60 * 24)))
    : 0;

  if (goalsQ.isPending) {
    return (
      <div className="space-y-4">
        <h1 className="font-display text-3xl font-bold">Welcome back, {user.name.split(" ")[0]}.</h1>
        <SkeletonMetricGrid items={4} />
        <SkeletonTable rows={6} cols={10} />
      </div>
    );
  }

  const totalWeight = goals.reduce((s, g) => s + g.weightage, 0);
  const draftOrReturned = goals.filter((g) => g.approvalStatus === "DRAFT" || g.approvalStatus === "RETURNED");
  const score = overallScore(goals, "Q2");
  const pendingSubmit = goals.some((g) => g.approvalStatus === "PENDING" || g.approvalStatus === "DRAFT");

  const phases = [
    { key: "setup", label: "Goal Setting", done: true },
    { key: "q1", label: "Q1 Check-in", done: true },
    { key: "q2", label: "Q2 Check-in", active: activeCycle?.kind === "Q2" },
    { key: "q3", label: "Q3 Check-in", active: activeCycle?.kind === "Q3" },
    { key: "q4", label: "Q4 Check-in", active: activeCycle?.kind === "Q4" },
  ];

  const handleSubmit = async () => {
    setSubmitMsg(null);
    try {
      const res = await submit.mutateAsync();
      setSubmitMsg(`Submitted ${res.submitted} goal(s) for manager approval.`);
    } catch (err) {
      setSubmitMsg(err instanceof Error ? err.message : "Submit failed");
    }
  };

  const canSubmit = draftOrReturned.length > 0 && totalWeight === 100 && draftOrReturned.every((g) => g.weightage >= 10);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-display text-3xl font-bold">Welcome back, {user.name.split(" ")[0]}.</h1>
        <p className="text-muted-foreground text-sm mt-1">
          {activeCycle ? `${activeCycle.name} is open.` : "No active check-in window."} Keep your goals updated.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        <Bento className="p-5">
          <Eyebrow>My Goals</Eyebrow>
          <Metric value={`${goals.length}/8`} />
        </Bento>
        <Bento className="p-5">
          <Eyebrow>Weightage Used</Eyebrow>
          <Metric value={totalWeight} suffix="%" />
          <div className="mt-3"><GoldBar value={totalWeight} danger={totalWeight !== 100} /></div>
        </Bento>
        <Bento className="p-5">
          <Eyebrow>Current Status</Eyebrow>
          <div className="mt-2 flex items-center gap-2">
            <span className="h-2 w-2 bg-gold rounded-full pulse-gold" />
            <span className="font-display font-bold text-lg">{activeCycle?.name ?? "Cycle Closed"}</span>
          </div>
        </Bento>
        <Bento className="p-5 flex items-center justify-between">
          <div>
            <Eyebrow>Overall Progress</Eyebrow>
            <p className="text-xs text-muted-foreground mt-2">Weighted across all goals</p>
          </div>
          <CircularProgress value={score} />
        </Bento>
      </div>

      {/* BRD §1 pain point A/B — give the employee real-time visibility into the
          manager's approval queue so submission isn't a black box. */}
      {pendingGoals.length > 0 && (
        <Bento className={`p-5 ${daysWaiting >= 3 ? "border-l-2 border-l-gold" : ""}`}>
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="flex items-start gap-3">
              <Clock className={`h-5 w-5 mt-0.5 shrink-0 ${daysWaiting >= 3 ? "text-gold" : "text-muted-foreground"}`} />
              <div>
                <h3 className="font-display font-bold text-sm">Awaiting manager approval</h3>
                <p className="text-xs text-muted-foreground mt-1">
                  {pendingGoals.length} goal{pendingGoals.length === 1 ? "" : "s"} submitted{manager ? ` to ${manager.name}` : ""}
                  {oldestSubmittedAt && (
                    <>
                      {" · "}
                      <span className={daysWaiting >= 3 ? "text-gold font-medium" : ""}>
                        {daysWaiting === 0 ? "submitted today" : `${daysWaiting} day${daysWaiting === 1 ? "" : "s"} waiting`}
                      </span>
                    </>
                  )}
                </p>
              </div>
            </div>
            {daysWaiting >= 3 && (
              <span className="text-[10px] tracking-widest uppercase border border-gold text-gold px-2 py-1">
                Manager nudge will fire via escalation
              </span>
            )}
          </div>
        </Bento>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-3">
        <Bento className="overflow-hidden">
          <div className="p-4 border-b border-line flex items-center justify-between">
            <h2 className="font-display font-bold">Goal Sheet — FY{new Date().getFullYear()}</h2>
            <span className="label-eyebrow">{goals.length} goals</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left min-w-[860px]">
              <thead className="bg-background">
                <tr className="text-[10px] tracking-widest uppercase text-muted-foreground">
                  <th className="px-3 py-3 font-medium">Thrust Area</th>
                  <th className="px-3 py-3 font-medium">Goal Title</th>
                  <th className="px-3 py-3 font-medium">UoM</th>
                  <th className="px-3 py-3 font-medium">Target</th>
                  <th className="px-3 py-3 font-medium">Q1</th>
                  <th className="px-3 py-3 font-medium">Q2</th>
                  <th className="px-3 py-3 font-medium">Q3</th>
                  <th className="px-3 py-3 font-medium">Q4</th>
                  <th className="px-3 py-3 font-medium">Weight</th>
                  <th className="px-3 py-3 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {goals.map((g, i) => <GoalRow key={g.id} g={g} idx={i} me={user} />)}
                {goals.length === 0 && (
                  <tr><td colSpan={10} className="p-6 text-center text-sm text-muted-foreground">No goals yet — click "Add New Goal" to start.</td></tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="p-4 border-t border-line">
            <div className="flex items-center justify-between text-xs mb-2">
              <span className="text-muted-foreground tracking-widest uppercase">Weightage Total</span>
              <span className={`font-mono ${totalWeight === 100 ? "text-gold" : "text-destructive"}`}>{totalWeight}% / 100%</span>
            </div>
            <GoldBar value={totalWeight} danger={totalWeight !== 100} />
          </div>
        </Bento>

        <div className="space-y-3">
          <Bento className="p-4">
            <Eyebrow>Quick Action</Eyebrow>
            <OutlineButton className="w-full mt-3 flex items-center justify-center gap-2" onClick={() => setModal(true)}>
              <Plus className="h-4 w-4" /> Add New Goal
            </OutlineButton>
          </Bento>

          <Bento className="p-4">
            <Eyebrow>Cycle Timeline</Eyebrow>
            <ol className="mt-4 space-y-3">
              {phases.map((p, i) => (
                <li key={p.key} className="flex items-center gap-3 text-sm">
                  <span className={`h-2 w-2 rounded-full ${p.active ? "bg-gold pulse-gold" : p.done ? "bg-gold/50" : "bg-line"}`} />
                  <span className={p.active ? "text-gold font-medium" : p.done ? "text-foreground" : "text-muted-foreground"}>{p.label}</span>
                  {i < phases.length - 1 && <span className="text-line ml-auto">·</span>}
                </li>
              ))}
            </ol>
          </Bento>

          <Bento className="p-4">
            <Eyebrow>Submission Status</Eyebrow>
            <div className="mt-3 flex items-center gap-2 text-sm">
              {pendingSubmit ? (
                <><AlertTriangle className="h-4 w-4 text-gold" /><span className="text-gold">Pending Submission</span></>
              ) : (
                <><CheckCircle2 className="h-4 w-4 text-gold" /><span>Goals Submitted</span></>
              )}
            </div>
            <GoldButton className="w-full mt-4" disabled={!canSubmit || submit.isPending} onClick={handleSubmit}>
              {submit.isPending ? "Submitting…" : "Submit for Approval"}
            </GoldButton>
            {!canSubmit && totalWeight !== 100 && (
              <p className="text-[10px] text-destructive mt-2">Total weightage must equal 100%.</p>
            )}
            {submitMsg && (
              <p className={`text-[11px] mt-2 flex items-center gap-1 ${submitMsg.includes("Submitted") ? "text-gold" : "text-destructive"}`}>
                <AlertCircle className="h-3 w-3" /> {submitMsg}
              </p>
            )}
          </Bento>
        </div>
      </div>

      <GoalModal open={modal} onClose={() => setModal(false)} />
    </div>
  );
}
