import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Bento, GoldBar, GoldButton, OutlineButton, Input, Textarea, Chip, StatusBadge } from "./ui-kit";
import type { Goal, ThrustArea, UoM, Direction, Quarter, User } from "@/api/types";
import { THRUST_AREAS, UOMS, THRUST_LABEL, UOM_LABEL } from "@/api/types";
import { THRUST_CONTEXT } from "@/api/thrust-context";
import { useCreateGoal, useGoals, useUpdateGoal } from "@/api/hooks";
import { X, Lock, Target as TargetIcon, AlertCircle } from "lucide-react";

const Q_KEYS: Quarter[] = ["Q1", "Q2", "Q3", "Q4"];

export function GoalModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const create = useCreateGoal();
  const goalsQ = useGoals({ mine: true });
  const goals = goalsQ.data ?? [];
  const used = goals.reduce((s, g) => s + g.weightage, 0);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [thrustArea, setThrustArea] = useState<ThrustArea>("PRODUCT_INNOVATION");
  const [uom, setUom] = useState<UoM>("NUMERIC");
  const [direction, setDirection] = useState<Direction>("MIN");
  const [target, setTarget] = useState<number>(100);
  const [weightage, setWeightage] = useState<number>(10);
  const [serverError, setServerError] = useState<string | null>(null);

  if (!open) return null;

  const newTotal = used + weightage;
  const exceeds = newTotal > 100;
  const tooLow = weightage < 10;
  const tooMany = goals.length >= 8;
  const canSave = !!title && !exceeds && !tooLow && !tooMany;
  const showDirection = uom === "NUMERIC" || uom === "PERCENTAGE";

  const save = async () => {
    setServerError(null);
    try {
      await create.mutateAsync({ title, description, thrustArea, uom, direction, target, weightage });
      // Only reset and close on success — keep the form state intact on validation errors
      // so the user can fix the field without retyping everything.
      setTitle("");
      setDescription("");
      setWeightage(10);
      onClose();
    } catch (err) {
      setServerError(err instanceof Error ? err.message : "Could not save goal");
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-md" onClick={onClose} />
      <div className="relative bg-white/95 backdrop-blur-xl border border-line shadow-2xl shadow-foreground/10 w-full max-w-lg max-h-[90vh] overflow-y-auto animate-in zoom-in-95 duration-200">
        <div className="flex items-center justify-between p-5 border-b border-line">
          <h3 className="font-display font-bold text-lg">Create New Goal</h3>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
        </div>
        <div className="p-5 space-y-4">
          <Field label="Thrust Area">
            <select value={thrustArea} onChange={(e) => setThrustArea(e.target.value as ThrustArea)} className="w-full bg-white border border-line text-foreground px-3 py-2.5 text-sm focus:outline-none focus:border-gold focus:ring-2 focus:ring-gold/25 transition-all">
              {THRUST_AREAS.map((t) => <option key={t} value={t}>{THRUST_LABEL[t]}</option>)}
            </select>
            {/* BRD §1 alignment context — show what this area means at the company level so
                the employee can see how their goal connects to org priorities. */}
            <div className="mt-2 border-l-2 border-gold bg-gold/5 p-3 text-xs space-y-2">
              <p className="text-foreground leading-relaxed">{THRUST_CONTEXT[thrustArea].description}</p>
              <div className="flex flex-wrap gap-3 text-[11px]">
                <span className="text-muted-foreground">
                  Owner: <span className="text-foreground font-medium">{THRUST_CONTEXT[thrustArea].ownerRole}</span>
                </span>
                <span className="text-muted-foreground">·</span>
                <span className="text-muted-foreground">
                  Company KPI: <span className="text-gold font-mono">{THRUST_CONTEXT[thrustArea].companyKpi}</span>
                </span>
              </div>
              <details className="text-[11px] text-muted-foreground">
                <summary className="cursor-pointer hover:text-foreground transition-colors">
                  Need inspiration? Example goal titles
                </summary>
                <ul className="mt-1.5 ml-3 list-disc space-y-0.5">
                  {THRUST_CONTEXT[thrustArea].exampleGoals.map((g) => (
                    <li key={g}>{g}</li>
                  ))}
                </ul>
              </details>
            </div>
          </Field>
          <Field label="Goal Title">
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Launch BLDC v4" />
          </Field>
          <Field label="Description">
            <Textarea rows={3} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Concrete outcome and context…" />
          </Field>
          <Field label="Unit of Measurement">
            <div className="grid grid-cols-4 gap-2">
              {UOMS.map((u) => (
                <Chip key={u} active={uom === u} onClick={() => setUom(u)}>{UOM_LABEL[u]}</Chip>
              ))}
            </div>
          </Field>
          {showDirection && (
            <Field label="Direction (BRD §2.2)">
              <div className="flex gap-2">
                <Chip active={direction === "MIN"} onClick={() => setDirection("MIN")}>Higher is better</Chip>
                <Chip active={direction === "MAX"} onClick={() => setDirection("MAX")}>Lower is better</Chip>
              </div>
            </Field>
          )}
          <div className="grid grid-cols-2 gap-3">
            <Field label="Target Value"><Input type="number" value={target} onChange={(e) => setTarget(Number(e.target.value))} /></Field>
            <Field label="Weightage %"><Input type="number" value={weightage} onChange={(e) => setWeightage(Number(e.target.value))} /></Field>
          </div>

          <div className="bento p-3">
            <div className="flex items-center justify-between text-xs mb-2">
              <span className="text-muted-foreground">Weightage total</span>
              <span className={`font-mono ${exceeds ? "text-destructive" : "text-gold"}`}>{newTotal}% / 100%</span>
            </div>
            <GoldBar value={newTotal} danger={exceeds} />
            {exceeds && <p className="mt-2 text-xs text-destructive">Total exceeds 100%. Reduce weightage.</p>}
            {tooLow && <p className="mt-2 text-xs text-destructive">Minimum 10% per goal.</p>}
            {tooMany && <p className="mt-2 text-xs text-destructive">Max 8 goals reached.</p>}
            {serverError && <p className="mt-2 text-xs text-destructive">{serverError}</p>}
          </div>
        </div>
        <div className="p-5 border-t border-line flex justify-end gap-3">
          <OutlineButton onClick={onClose}>Cancel</OutlineButton>
          <GoldButton disabled={!canSave || create.isPending} onClick={save}>
            {create.isPending ? "Saving…" : "Save Goal"}
          </GoldButton>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="label-eyebrow mb-1.5">{label}</div>
      {children}
    </div>
  );
}

// BRD §2.1 — employee can edit weightage on:
//   (a) their own DRAFT or RETURNED goals (rebalance after rework), and
//   (b) any shared clone they receive (recipients adjust weightage only).
// All other fields stay read-only on this row; full edits go through GoalModal.
function canEmployeeEditWeightage(g: Goal, meId?: string): boolean {
  if (!meId || g.ownerId !== meId) return false;
  if (g.isSharedClone) return true;
  if (g.approvalStatus === "DRAFT" || g.approvalStatus === "RETURNED") return !g.locked;
  return false;
}

// Debounced inline weightage editor — 600ms after last keystroke, also commits on blur.
// Reuses the optimistic-update path from useUpdateGoal so the row updates instantly.
function InlineWeightInput({ initial, onCommit }: { initial: number; onCommit: (n: number) => void }) {
  const [value, setValue] = useState(String(initial));
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastCommitted = useRef(initial);

  useEffect(() => {
    if (initial !== lastCommitted.current) {
      setValue(String(initial));
      lastCommitted.current = initial;
    }
  }, [initial]);

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const fire = (v: string) => {
    const n = Number(v);
    if (!Number.isFinite(n)) return;
    if (n === lastCommitted.current) return;
    lastCommitted.current = n;
    onCommit(n);
  };

  return (
    <input
      type="number"
      value={value}
      min={10}
      max={100}
      onChange={(e) => {
        const v = e.target.value;
        setValue(v);
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(() => fire(v), 600);
      }}
      onBlur={() => {
        if (timer.current) clearTimeout(timer.current);
        fire(value);
      }}
      className="w-16 bg-white border border-line px-2 py-1 text-xs font-mono text-gold text-right focus:outline-none focus:border-gold focus:ring-2 focus:ring-gold/25"
    />
  );
}

export function GoalRow({ g, idx, me }: { g: Goal; idx: number; me?: User | null }) {
  const updateGoal = useUpdateGoal();
  const editable = canEmployeeEditWeightage(g, me?.id);
  const score = (q: Quarter) => {
    const a = g.quarters.find((x) => x.quarter === q)?.actual;
    if (a == null) return "—";
    if (g.uom === "ZERO_BASED") return a === 0 ? "✓" : "✗";
    return String(a);
  };
  return (
    <>
      <tr className={`${idx % 2 === 0 ? "bg-card-bg" : "bg-off-black"} ${g.locked ? "opacity-90" : ""} ${g.approvalStatus === "RETURNED" ? "border-l-2 border-l-destructive" : ""} group hover:bg-muted transition-colors relative`}>
        <td className="px-3 py-3 text-xs text-muted-foreground border-r border-line">
          <div>{THRUST_LABEL[g.thrustArea]}</div>
          <div
            className="text-[10px] text-muted-foreground/80 mt-0.5 flex items-center gap-1"
            title={THRUST_CONTEXT[g.thrustArea].companyKpi}
          >
            <TargetIcon className="h-2.5 w-2.5 text-gold/70 shrink-0" />
            <span className="truncate max-w-[140px]">{THRUST_CONTEXT[g.thrustArea].companyKpi}</span>
          </div>
        </td>
        <td className="px-3 py-3 text-sm">
          <div className="flex items-center gap-2 flex-wrap">
            {g.locked && <Lock className="h-3 w-3 text-gold" />}
            <span>{g.title}</span>
            {g.isSharedClone && (
              <span
                className="text-[10px] tracking-wider uppercase border border-gold/50 text-gold px-1.5 py-0.5"
                title="Shared from a departmental KPI — title and target are set by the primary owner; you can only adjust your weightage."
              >
                Shared · weightage-only
              </span>
            )}
            {g.isSharedPrimary && <span className="text-[10px] tracking-wider uppercase bg-gold/15 border border-gold/50 text-gold px-1.5 py-0.5">Primary</span>}
          </div>
        </td>
        <td className="px-3 py-3 text-xs text-muted-foreground">{UOM_LABEL[g.uom]}{(g.uom === "NUMERIC" || g.uom === "PERCENTAGE") && g.direction === "MAX" ? " ↓" : ""}</td>
        <td className="px-3 py-3 text-xs font-mono text-gold">{g.target}</td>
        <td className="px-3 py-3 text-xs font-mono text-muted-foreground">{score("Q1")}</td>
        <td className="px-3 py-3 text-xs font-mono text-muted-foreground">{score("Q2")}</td>
        <td className="px-3 py-3 text-xs font-mono text-muted-foreground">{score("Q3")}</td>
        <td className="px-3 py-3 text-xs font-mono text-muted-foreground">{score("Q4")}</td>
        <td className="px-3 py-3 text-xs font-mono text-gold">
          {editable ? (
            <InlineWeightInput
              initial={g.weightage}
              onCommit={(n) =>
                updateGoal.mutate(
                  { id: g.id, patch: { weightage: n } },
                  {
                    onSuccess: () => toast.success(`Weight updated · ${g.title.slice(0, 28)}`),
                    onError: (er) => toast.error(er instanceof Error ? er.message : "Weight update failed"),
                  },
                )
              }
            />
          ) : (
            <>{g.weightage}%</>
          )}
        </td>
        <td className="px-3 py-3"><StatusBadge status={g.approvalStatus} /></td>
      </tr>
      {/* BRD §2.1 — surface the manager's return reason inline so the employee can act
          without checking email. Only renders for RETURNED goals with a stored reason. */}
      {g.approvalStatus === "RETURNED" && g.returnReason && (
        <tr className={idx % 2 === 0 ? "bg-card-bg" : "bg-off-black"}>
          <td colSpan={10} className="px-3 pb-3">
            <div className="border-l-2 border-destructive bg-destructive/5 px-3 py-2 text-xs flex items-start gap-2">
              <AlertCircle className="h-3.5 w-3.5 text-destructive shrink-0 mt-0.5" />
              <div>
                <span className="text-[10px] tracking-widest uppercase text-destructive font-mono mr-2">Manager said</span>
                <span className="text-foreground">{g.returnReason}</span>
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
