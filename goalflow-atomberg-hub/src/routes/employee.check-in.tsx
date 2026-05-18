import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useStore, computeScore } from "@/lib/store";
import { useGoals, useUpdateQuarter, useActiveCycle } from "@/api/hooks";
import { guardRoute } from "@/lib/auth-guard";
import { Bento, Chip, GoldButton, Input, Textarea, Eyebrow } from "@/components/ui-kit";
import { SkeletonMetricGrid, SkeletonTable, RouteError } from "@/components/Skeleton";
import { UOM_LABEL, THRUST_LABEL, STATUS_LABEL } from "@/api/types";
import type { Quarter } from "@/api/types";
import { THRUST_CONTEXT } from "@/api/thrust-context";
import { splitNote, setEmployeeNote } from "@/lib/note-format";
import { Lock, ArrowRight, Target, MessageSquare } from "lucide-react";
import { toast } from "sonner";

// Debounced controlled input — local state, commits to server 700ms after last keystroke.
// Prevents firing one PATCH per character when an employee types "63" into Actual.
function DebouncedField<T extends HTMLInputElement | HTMLTextAreaElement>({
  initial,
  disabled,
  onCommit,
  as,
  ...rest
}: {
  initial: string;
  disabled?: boolean;
  onCommit: (value: string) => void;
  as: "input" | "textarea";
} & React.HTMLAttributes<T> & { className?: string; placeholder?: string; type?: string; rows?: number }) {
  const [value, setValue] = useState(initial);
  const timeout = useRef<number | null>(null);

  // Sync external value changes (e.g. after server refetch confirms different value)
  // — but only when not in the middle of editing.
  useEffect(() => {
    if (timeout.current === null) setValue(initial);
  }, [initial]);

  // Cancel any pending commit when the component unmounts so a late timer
  // doesn't fire after the user has already navigated away (which would
  // overwrite newer state via the optimistic update).
  useEffect(() => {
    return () => {
      if (timeout.current) {
        window.clearTimeout(timeout.current);
        timeout.current = null;
      }
    };
  }, []);

  const commit = (next: string) => {
    if (timeout.current) window.clearTimeout(timeout.current);
    timeout.current = null;
    onCommit(next);
  };

  const onChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const next = e.target.value;
    setValue(next);
    if (timeout.current) window.clearTimeout(timeout.current);
    timeout.current = window.setTimeout(() => commit(next), 700);
  };

  const onBlur = () => {
    if (timeout.current) {
      window.clearTimeout(timeout.current);
      timeout.current = null;
      commit(value);
    }
  };

  if (as === "textarea") {
    return (
      <Textarea
        {...(rest as React.TextareaHTMLAttributes<HTMLTextAreaElement>)}
        value={value}
        disabled={disabled}
        onChange={onChange}
        onBlur={onBlur}
      />
    );
  }
  return (
    <Input
      {...(rest as React.InputHTMLAttributes<HTMLInputElement>)}
      value={value}
      disabled={disabled}
      onChange={onChange}
      onBlur={onBlur}
    />
  );
}

export const Route = createFileRoute("/employee/check-in")({
  beforeLoad: ({ context }) => guardRoute(context, ["EMPLOYEE"]),
  component: CheckInPage,
  errorComponent: ({ error, reset }) => <RouteError error={error} reset={reset} />,
});

function CheckInPage() {
  const goalsQ = useGoals({ mine: true });
  const activeCycleQ = useActiveCycle();
  const goals = goalsQ.data ?? [];
  const activeCycle = activeCycleQ.data;
  const update = useUpdateQuarter();
  const [q, setQ] = useState<Quarter>(() => {
    if (activeCycle && (activeCycle.kind === "Q1" || activeCycle.kind === "Q2" || activeCycle.kind === "Q3" || activeCycle.kind === "Q4")) {
      return activeCycle.kind as Quarter;
    }
    return "Q2";
  });

  if (goalsQ.isPending || activeCycleQ.isPending) {
    return (
      <div className="space-y-4">
        <h1 className="font-display text-3xl font-bold">Quarterly Check-in</h1>
        <SkeletonMetricGrid items={3} />
        <SkeletonTable rows={5} cols={6} />
      </div>
    );
  }

  const activeQuarter: Quarter | null =
    activeCycle && ["Q1", "Q2", "Q3", "Q4"].includes(activeCycle.kind) ? (activeCycle.kind as Quarter) : null;
  const lockedView = activeQuarter !== q;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-3xl font-bold">Quarterly Check-in</h1>
          {activeCycle && (
            <p className="text-xs text-muted-foreground mt-1">
              Active window: <span className="text-gold font-mono">{activeCycle.name}</span> — closes {new Date(activeCycle.closeDate).toLocaleDateString()}
            </p>
          )}
        </div>
        <div className="flex gap-2">
          {(["Q1", "Q2", "Q3", "Q4"] as Quarter[]).map((qk) => (
            <Chip key={qk} active={q === qk} onClick={() => setQ(qk)}>{qk}</Chip>
          ))}
        </div>
      </div>

      {lockedView && (
        <div className="border-l-2 border-gold bg-gold/5 px-4 py-3 flex items-center gap-3 text-sm">
          <Lock className="h-4 w-4 text-gold shrink-0" />
          <div className="flex-1">
            <span className="font-medium">Viewing {q} (read-only).</span>{" "}
            <span className="text-muted-foreground">
              Switch to {activeQuarter ?? "Goal Setting"} to log actuals — only the active quarter is editable per BRD §2.3.
            </span>
          </div>
          {activeQuarter && (
            <button
              type="button"
              onClick={() => setQ(activeQuarter)}
              className="text-xs px-3 py-1.5 border border-gold text-gold hover:bg-gold/10 transition-colors shrink-0"
            >
              Go to {activeQuarter} →
            </button>
          )}
        </div>
      )}

      <div className="grid gap-3">
        {goals.map((g) => {
          const upd = g.quarters.find((x) => x.quarter === q);
          const score = computeScore(g, { actual: upd?.actual ?? null });
          const isSharedClone = g.isSharedClone;
          const editable = !lockedView && !isSharedClone;

          const noteParts = splitNote(upd?.note);
          return (
            <Bento key={g.id} className="p-5">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <h3 className="font-display text-lg font-bold flex items-center gap-2 flex-wrap">
                    {g.title}
                    {isSharedClone && <span className="text-[10px] tracking-wider uppercase border border-gold/50 text-gold px-1.5 py-0.5">Shared — view only</span>}
                  </h3>
                  <p className="text-xs text-muted-foreground mt-1">{THRUST_LABEL[g.thrustArea]} · {g.description}</p>
                  <p className="text-[11px] text-muted-foreground/80 mt-1 flex items-center gap-1">
                    <Target className="h-3 w-3 text-gold/70 shrink-0" />
                    <span className="truncate">Contributes to: <span className="text-gold">{THRUST_CONTEXT[g.thrustArea].companyKpi}</span></span>
                  </p>
                </div>
                <span className="text-[10px] tracking-widest uppercase border border-gold text-gold px-2 py-0.5 shrink-0">{UOM_LABEL[g.uom]}</span>
              </div>

              <div className="mt-4 grid grid-cols-1 md:grid-cols-4 gap-4">
                <div>
                  <Eyebrow>Planned Target</Eyebrow>
                  <p className="font-mono text-gold text-2xl mt-1">{g.target}</p>
                </div>
                <div>
                  <Eyebrow>Actual Achievement</Eyebrow>
                  {g.uom === "ZERO_BASED" ? (
                    <div className="mt-2 flex gap-2">
                      {[{ l: "Yes", v: 0 }, { l: "No", v: 1 }].map((opt) => (
                        <Chip
                          key={opt.l}
                          active={Number(upd?.actual ?? -1) === opt.v}
                          disabled={!editable}
                          onClick={() => update.mutate(
                            { goalId: g.id, q, patch: { actual: opt.v } },
                            { onError: (e) => toast.error(e instanceof Error ? e.message : "Update failed") },
                          )}
                        >
                          {opt.l}
                        </Chip>
                      ))}
                    </div>
                  ) : (
                    <DebouncedField
                      as="input"
                      type="number"
                      disabled={!editable}
                      className="mt-1"
                      placeholder={g.uom === "TIMELINE" ? "days" : ""}
                      initial={upd?.actual != null ? String(upd.actual) : ""}
                      onCommit={(raw) =>
                        update.mutate(
                          { goalId: g.id, q, patch: { actual: raw === "" ? null : Number(raw) } },
                          { onError: (err) => toast.error(err instanceof Error ? err.message : "Update failed") },
                        )
                      }
                    />
                  )}
                </div>
                <div>
                  <Eyebrow>Computed Score</Eyebrow>
                  <p className={`font-mono text-2xl mt-1 ${score.ok ? "text-gold" : "text-muted-foreground"}`}>{score.display}</p>
                </div>
                <div>
                  <Eyebrow>Status</Eyebrow>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {(["NOT_STARTED", "ON_TRACK", "COMPLETED"] as const).map((s) => (
                      <Chip
                        key={s}
                        active={upd?.status === s}
                        disabled={!editable}
                        onClick={() => update.mutate(
                          { goalId: g.id, q, patch: { status: s } },
                          { onError: (err) => toast.error(err instanceof Error ? err.message : "Update failed") },
                        )}
                      >
                        {STATUS_LABEL[s]}
                      </Chip>
                    ))}
                  </div>
                </div>
              </div>

              {/* Manager check-in comment — read-only callout, BRD §2.2 feedback loop */}
              {noteParts.manager && (
                <div className="mt-4 border-l-2 border-gold bg-gold/5 p-3">
                  <div className="flex items-center gap-2 mb-1">
                    <MessageSquare className="h-3.5 w-3.5 text-gold" />
                    <span className="text-[10px] tracking-widest uppercase text-gold font-mono">Manager said · {q}</span>
                  </div>
                  <p className="text-sm whitespace-pre-wrap">{noteParts.manager}</p>
                </div>
              )}

              <div className="mt-4">
                <Eyebrow>Your note (optional)</Eyebrow>
                <DebouncedField
                  as="textarea"
                  rows={2}
                  disabled={!editable}
                  className="mt-1"
                  placeholder="Your own context for this quarter — visible to your manager and HR."
                  initial={noteParts.employee}
                  onCommit={(raw) => {
                    const next = setEmployeeNote(upd?.note, raw);
                    update.mutate(
                      { goalId: g.id, q, patch: { note: next } },
                      { onError: (err) => toast.error(err instanceof Error ? err.message : "Update failed") },
                    );
                  }}
                />
              </div>
            </Bento>
          );
        })}
        {goals.length === 0 && (
          <Bento className="p-10 text-center">
            <Target className="h-10 w-10 text-gold mx-auto mb-4 opacity-70" />
            <h3 className="font-display text-lg font-bold mb-1">No goals to check in on yet</h3>
            <p className="text-sm text-muted-foreground mb-5 max-w-md mx-auto">
              You'll see your approved goals here once your manager signs off. Start by drafting goals for this cycle.
            </p>
            <Link
              to="/employee/goals"
              className="inline-flex items-center gap-2 px-4 py-2 border border-gold text-gold hover:bg-gold/10 transition-colors text-sm font-medium"
            >
              Create goals on My Goals <ArrowRight className="h-4 w-4" />
            </Link>
          </Bento>
        )}
      </div>
    </div>
  );
}
