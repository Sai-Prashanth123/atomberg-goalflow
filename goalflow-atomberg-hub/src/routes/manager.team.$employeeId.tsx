import { createFileRoute, Link } from "@tanstack/react-router";
import { Fragment, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { useStore, computeScore } from "@/lib/store";
import { useUser, useGoals, useApproveGoal, useReturnGoal, useUpdateGoal, useUnlockGoal, useUpdateQuarter, useActiveCycle } from "@/api/hooks";
import { guardRoute } from "@/lib/auth-guard";
import { Bento, Eyebrow, GoldButton, OutlineButton, StatusBadge, Input, Textarea } from "@/components/ui-kit";
import { UOM_LABEL } from "@/api/types";
import type { Quarter } from "@/api/types";
import { THRUST_CONTEXT } from "@/api/thrust-context";
import { splitNote, setManagerNote } from "@/lib/note-format";
import { Target as TargetIcon, ArrowLeft, Check, X, Lock, MessageSquare } from "lucide-react";

// Debounced textarea for the manager's per-quarter check-in comment.
// Commits 700ms after last keystroke and on blur, with unmount cleanup.
function DebouncedNoteField({
  initial,
  onCommit,
  disabled,
  placeholder,
}: {
  initial: string;
  onCommit: (value: string) => void;
  disabled?: boolean;
  placeholder?: string;
}) {
  const [value, setValue] = useState(initial);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (timer.current === null) setValue(initial);
  }, [initial]);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
  const commit = (next: string) => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    if (next !== initial) onCommit(next);
  };
  return (
    <Textarea
      rows={2}
      disabled={disabled}
      value={value}
      placeholder={placeholder}
      onChange={(e) => {
        const next = e.target.value;
        setValue(next);
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(() => commit(next), 700);
      }}
      onBlur={() => commit(value)}
    />
  );
}

// Debounced numeric input — local state, fires onCommit 600ms after last keystroke.
function DebouncedNumberInput({
  initialValue,
  disabled,
  onCommit,
  className = "",
}: {
  initialValue: number;
  disabled?: boolean;
  onCommit: (n: number) => void;
  className?: string;
}) {
  const [value, setValue] = useState(String(initialValue));
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastCommitted = useRef(initialValue);

  // External value changes (e.g., after server invalidation) sync into local state
  useEffect(() => {
    if (initialValue !== lastCommitted.current) {
      setValue(String(initialValue));
      lastCommitted.current = initialValue;
    }
  }, [initialValue]);

  return (
    <Input
      type="number"
      disabled={disabled}
      value={value}
      onChange={(e) => {
        const v = e.target.value;
        setValue(v);
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(() => {
          const n = Number(v);
          if (Number.isFinite(n) && n !== lastCommitted.current) {
            lastCommitted.current = n;
            onCommit(n);
          }
        }, 600);
      }}
      onBlur={() => {
        if (timer.current) clearTimeout(timer.current);
        const n = Number(value);
        if (Number.isFinite(n) && n !== lastCommitted.current) {
          lastCommitted.current = n;
          onCommit(n);
        }
      }}
      className={className}
    />
  );
}

export const Route = createFileRoute("/manager/team/$employeeId")({
  beforeLoad: ({ context }) => guardRoute(context, ["MANAGER", "ADMIN"]),
  component: TeamMember,
});

function TeamMember() {
  const { employeeId } = Route.useParams();
  const me = useStore((s) => s.currentUser!);
  const userQ = useUser(employeeId);
  const goalsQ = useGoals({ ownerId: employeeId });
  const activeCycleQ = useActiveCycle();
  const approve = useApproveGoal();
  const returnGoal = useReturnGoal();
  const update = useUpdateGoal();
  const unlock = useUnlockGoal();
  const updateQuarter = useUpdateQuarter();
  const [returnReasons, setReturnReasons] = useState<Record<string, string>>({});

  const user = userQ.data;
  const goals = goalsQ.data ?? [];
  const activeCycle = activeCycleQ.data;
  const activeQuarter: Quarter =
    activeCycle && ["Q1", "Q2", "Q3", "Q4"].includes(activeCycle.kind)
      ? (activeCycle.kind as Quarter)
      : "Q2";

  if (!user) return <div className="text-muted-foreground">Loading…</div>;

  const approveAll = async () => {
    let approved = 0;
    const failed: string[] = [];
    for (const g of goals) {
      if (g.approvalStatus === "PENDING") {
        try {
          await approve.mutateAsync(g.id);
          approved++;
        } catch (e) {
          failed.push(g.title);
        }
      }
    }
    if (approved > 0) toast.success(`Approved ${approved} goal${approved === 1 ? "" : "s"}`);
    if (failed.length > 0) toast.error(`Could not approve: ${failed.slice(0, 3).join(", ")}${failed.length > 3 ? ` +${failed.length - 3} more` : ""}`);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Link to="/manager/dashboard" className="text-muted-foreground hover:text-gold flex items-center gap-1 text-sm">
          <ArrowLeft className="h-4 w-4" /> Team
        </Link>
        <span className="text-muted-foreground">/</span>
        <h1 className="font-display text-2xl font-bold">{user.name}</h1>
        <span className="text-[10px] tracking-widest uppercase border border-gold/50 text-gold px-2 py-0.5">{user.role}</span>
      </div>

      <Bento className="overflow-hidden">
        <div className="p-4 border-b border-line flex items-center justify-between">
          <h2 className="font-display font-bold">Goal Sheet — Approval & Edits</h2>
          <span className="label-eyebrow">{goals.length} goals</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm min-w-[860px]">
            <thead className="bg-background">
              <tr className="text-[10px] tracking-widest uppercase text-muted-foreground">
                <th className="px-3 py-3 font-medium">Goal</th>
                <th className="px-3 py-3 font-medium">UoM</th>
                <th className="px-3 py-3 font-medium">Target</th>
                <th className="px-3 py-3 font-medium">Weight</th>
                <th className="px-3 py-3 font-medium">Status</th>
                <th className="px-3 py-3 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {goals.map((g, i) => {
                const lockedForMe = g.locked && me.role !== "ADMIN";
                return (
                  <tr key={g.id} className={`${i % 2 ? "bg-off-black" : "bg-card-bg"} ${g.approvalStatus === "APPROVED" ? "border-l-2 border-l-gold" : ""} ${g.approvalStatus === "RETURNED" ? "border-l-2 border-l-destructive" : ""}`}>
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-2">
                        {g.approvalStatus === "APPROVED" && <Check className="h-3.5 w-3.5 text-gold" />}
                        {g.approvalStatus === "RETURNED" && <X className="h-3.5 w-3.5 text-destructive" />}
                        {g.locked && <Lock className="h-3 w-3 text-gold" />}
                        <span>{g.title}</span>
                        {g.isSharedClone && <span className="text-[10px] uppercase tracking-wider border border-gold/50 text-gold px-1.5 py-0.5">Shared</span>}
                      </div>
                      <div className="text-[10px] text-muted-foreground/80 mt-0.5 flex items-center gap-1">
                        <TargetIcon className="h-2.5 w-2.5 text-gold/70 shrink-0" />
                        <span className="truncate max-w-[280px]" title={THRUST_CONTEXT[g.thrustArea].companyKpi}>
                          {THRUST_CONTEXT[g.thrustArea].companyKpi}
                        </span>
                      </div>
                    </td>
                    <td className="px-3 py-3 text-xs text-muted-foreground">{UOM_LABEL[g.uom]}</td>
                    <td className="px-3 py-3">
                      <DebouncedNumberInput
                        initialValue={g.target}
                        disabled={lockedForMe || g.isSharedClone}
                        onCommit={(n) =>
                          update.mutate(
                            { id: g.id, patch: { target: n } },
                            {
                              onSuccess: () => toast.success(`Target updated · ${g.title.slice(0, 32)}`),
                              onError: (er) => toast.error(er instanceof Error ? er.message : "Update failed"),
                            },
                          )
                        }
                        className="!py-1 !px-2 w-20 text-xs"
                      />
                    </td>
                    <td className="px-3 py-3">
                      <DebouncedNumberInput
                        initialValue={g.weightage}
                        disabled={lockedForMe}
                        onCommit={(n) =>
                          update.mutate(
                            { id: g.id, patch: { weightage: n } },
                            {
                              onSuccess: () => toast.success(`Weight updated · ${g.title.slice(0, 32)}`),
                              onError: (er) => toast.error(er instanceof Error ? er.message : "Update failed"),
                            },
                          )
                        }
                        className="!py-1 !px-2 w-16 text-xs"
                      />
                    </td>
                    <td className="px-3 py-3"><StatusBadge status={g.approvalStatus} /></td>
                    <td className="px-3 py-3 text-right">
                      <div className="flex justify-end gap-2 items-center">
                        {g.approvalStatus === "PENDING" && (
                          <>
                            <Input placeholder="Reason…" value={returnReasons[g.id] ?? ""} onChange={(e) => setReturnReasons({ ...returnReasons, [g.id]: e.target.value })} className="!py-1 !px-2 text-xs w-32" />
                            <button disabled={!returnReasons[g.id]} onClick={() => returnGoal.mutate({ id: g.id, reason: returnReasons[g.id] }, { onSuccess: () => toast.success(`Returned · ${g.title.slice(0, 32)}`), onError: (er) => toast.error(er instanceof Error ? er.message : "Return failed") })} className="text-xs text-muted-foreground hover:text-destructive disabled:opacity-40">Return</button>
                            <button onClick={() => approve.mutate(g.id, { onSuccess: () => toast.success(`Approved · ${g.title.slice(0, 32)}`), onError: (er) => toast.error(er instanceof Error ? er.message : "Approve failed") })} className="text-xs text-gold hover:text-gold-hover">Approve</button>
                          </>
                        )}
                        {g.locked && me.role !== "ADMIN" && <span className="text-[10px] text-muted-foreground italic">Locked — admin required</span>}
                        {g.locked && me.role === "ADMIN" && (
                          <button onClick={() => unlock.mutate(g.id, { onSuccess: () => toast.success("Goal unlocked"), onError: (er) => toast.error(er instanceof Error ? er.message : "Unlock failed") })} className="text-xs text-destructive hover:text-gold-hover">Admin: Unlock</button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Bento>

      <Bento className="overflow-hidden">
        <div className="p-4 border-b border-line flex items-center justify-between">
          <h2 className="font-display font-bold">Planned vs Actual — Quarterly</h2>
          <span className="label-eyebrow">BRD §2.2</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-background">
              <tr className="text-[10px] tracking-widest uppercase text-muted-foreground">
                <th className="px-3 py-3 font-medium">Goal</th>
                <th className="px-3 py-3 font-medium">Target</th>
                {(["Q1", "Q2", "Q3", "Q4"] as const).map((q) => (
                  <th key={q} className="px-3 py-3 font-medium" colSpan={2}>{q} · Planned · Actual</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {goals.map((g, i) => (
                <tr key={g.id} className={i % 2 ? "bg-off-black" : "bg-card-bg"}>
                  <td className="px-3 py-3">
                    <div>{g.title}</div>
                    <div className="text-[10px] text-muted-foreground/80 mt-0.5 truncate max-w-[220px]" title={THRUST_CONTEXT[g.thrustArea].companyKpi}>
                      → {THRUST_CONTEXT[g.thrustArea].companyKpi}
                    </div>
                  </td>
                  <td className="px-3 py-3 font-mono text-gold">{g.target}</td>
                  {(["Q1", "Q2", "Q3", "Q4"] as const).map((q) => {
                    const upd = g.quarters.find((x) => x.quarter === q);
                    const score = computeScore(g, { actual: upd?.actual ?? null });
                    return (
                      <Fragment key={q}>
                        <td className="px-3 py-3 font-mono text-muted-foreground">{g.target}</td>
                        <td className={`px-3 py-3 font-mono ${score.ok ? "text-gold" : "text-muted-foreground"}`}>{upd?.actual ?? "—"} <span className="text-[10px]">({score.display})</span></td>
                      </Fragment>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Bento>

      <Bento className="overflow-hidden">
        <div className="p-4 border-b border-line flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-2">
            <MessageSquare className="h-4 w-4 text-gold" />
            <h2 className="font-display font-bold">Manager Check-in Comments</h2>
          </div>
          <span className="label-eyebrow">BRD §2.2 · active quarter: {activeQuarter}</span>
        </div>
        <div className="p-4 space-y-4">
          <p className="text-xs text-muted-foreground">
            Document the {activeQuarter} discussion per goal — context, blockers, next-quarter focus.
            Saved to the goal's quarter record so it appears in audit + reports.
          </p>
          {goals.length === 0 && (
            <div className="text-xs text-muted-foreground italic">No goals to comment on yet.</div>
          )}
          {goals
            .filter((g) => g.approvalStatus === "APPROVED")
            .map((g) => {
              const upd = g.quarters.find((x) => x.quarter === activeQuarter);
              return (
                <div key={g.id} className="border border-line p-3 bg-card-bg/40">
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <div className="text-sm font-medium">{g.title}</div>
                    <span className="text-[10px] tracking-widest uppercase text-muted-foreground">
                      Actual {upd?.actual ?? "—"} · {UOM_LABEL[g.uom]}
                    </span>
                  </div>
                  <DebouncedNoteField
                    initial={splitNote(upd?.note).manager}
                    placeholder={`${activeQuarter} manager comment — be specific. Shared read-only with the employee.`}
                    onCommit={(managerText) => {
                      const next = setManagerNote(upd?.note, managerText);
                      updateQuarter.mutate(
                        { goalId: g.id, q: activeQuarter, patch: { note: next } },
                        {
                          onSuccess: () => toast.success(`Comment saved · ${g.title.slice(0, 32)}`),
                          onError: (er) => toast.error(er instanceof Error ? er.message : "Save failed"),
                        },
                      );
                    }}
                  />
                </div>
              );
            })}
          {goals.length > 0 && goals.every((g) => g.approvalStatus !== "APPROVED") && (
            <div className="text-xs text-muted-foreground italic">
              No approved goals to comment on yet. Approve goals first.
            </div>
          )}
        </div>
      </Bento>

      <div className="grid grid-cols-2 gap-3">
        <OutlineButton className="!border-foreground !text-foreground hover:!bg-foreground/5" disabled>Return All (use per-row above)</OutlineButton>
        <GoldButton onClick={approveAll} disabled={approve.isPending || !goals.some((g) => g.approvalStatus === "PENDING")}>
          {approve.isPending ? "Approving…" : "Approve All Pending Goals"}
        </GoldButton>
      </div>
    </div>
  );
}
