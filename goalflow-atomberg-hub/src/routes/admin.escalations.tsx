import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useStore } from "@/lib/store";
import {
  useEscalationRules,
  useEscalationEvents,
  useTickEscalation,
  useResolveEscalation,
  useCreateEscalationRule,
  useUpdateEscalationRule,
  useDeleteEscalationRule,
  type EscalationRuleInput,
} from "@/api/hooks";
import type { EscalationRule } from "@/api/types";
import { guardRoute } from "@/lib/auth-guard";
import { Bento, GoldButton, OutlineButton, StatusBadge, Input } from "@/components/ui-kit";
import { AlertTriangle, Play, ArrowRight, Check, Plus, Pencil, Trash2, X } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";

export const Route = createFileRoute("/admin/escalations")({
  beforeLoad: ({ context }) => guardRoute(context, ["ADMIN"]),
  component: Escalations,
});

const triggerLabel: Record<string, string> = {
  GOAL_NOT_SUBMITTED: "Employee hasn't submitted goals",
  APPROVAL_PENDING: "Manager hasn't approved",
  CHECKIN_INCOMPLETE: "Check-in not completed in window",
};

const levelLabel: Record<number, string> = {
  1: "L1 · Manager",
  2: "L2 · Skip-level",
  3: "L3 · Admin",
};

function Escalations() {
  const rules = useEscalationRules().data ?? [];
  const events = useEscalationEvents().data ?? [];
  const tick = useTickEscalation();
  const resolve = useResolveEscalation();
  const createRule = useCreateEscalationRule();
  const updateRule = useUpdateEscalationRule();
  const deleteRule = useDeleteEscalationRule();
  const [tickResult, setTickResult] = useState<string | null>(null);
  const [ruleDialog, setRuleDialog] = useState<{ mode: "create" } | { mode: "edit"; rule: EscalationRule } | null>(null);

  const handleToggleEnabled = (rule: EscalationRule) => {
    updateRule.mutate(
      { id: rule.id, patch: { enabled: !rule.enabled } },
      {
        onSuccess: () => toast.success(`Rule "${rule.name}" ${rule.enabled ? "disabled" : "enabled"}`),
        onError: (err) => toast.error(err instanceof Error ? err.message : "Toggle failed"),
      },
    );
  };

  const handleDelete = (rule: EscalationRule) => {
    if (!window.confirm(`Delete rule "${rule.name}"? Past events stay in the log but the rule will not fire again.`)) return;
    deleteRule.mutate(rule.id, {
      onSuccess: () => toast.success(`Rule "${rule.name}" deleted`),
      onError: (err) => toast.error(err instanceof Error ? err.message : "Delete failed"),
    });
  };

  const runTick = async () => {
    setTickResult(null);
    try {
      await tick.mutateAsync();
      const msg = `Escalation tick ran at ${new Date().toLocaleTimeString()}.`;
      setTickResult(msg);
      toast.success(msg);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Tick failed";
      setTickResult(msg);
      toast.error(msg);
    }
  };

  const handleResolve = (id: string) => {
    resolve.mutate(id, {
      onSuccess: () => toast.success("Escalation resolved"),
      onError: (err) => toast.error(err instanceof Error ? err.message : "Resolve failed"),
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-3xl font-bold">Escalation Engine</h1>
        <GoldButton onClick={runTick} disabled={tick.isPending} className="flex items-center gap-2">
          <Play className="h-3.5 w-3.5" /> {tick.isPending ? "Running…" : "Run Now"}
        </GoldButton>
      </div>

      <p className="text-xs text-muted-foreground">
        Rules tick hourly (BRD §5.3). L1 → manager, L2 → skip-level, L3 → Admin. Use "Run Now" to fire a manual tick for the demo.
      </p>

      {tickResult && <div className="bento p-3 text-xs text-gold">{tickResult}</div>}

      <Bento className="overflow-hidden">
        <div className="p-4 border-b border-line flex items-center justify-between">
          <h2 className="font-display font-bold">Configured Rules</h2>
          <OutlineButton onClick={() => setRuleDialog({ mode: "create" })} className="text-xs py-1.5 px-3 inline-flex items-center gap-1.5">
            <Plus className="h-3.5 w-3.5" /> Add Rule
          </OutlineButton>
        </div>
        <table className="w-full text-left text-sm">
          <thead className="bg-background">
            <tr className="text-[10px] tracking-widest uppercase text-muted-foreground">
              <th className="px-4 py-3 font-medium">Name</th>
              <th className="px-4 py-3 font-medium">Trigger</th>
              <th className="px-4 py-3 font-medium">Threshold (days)</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rules.map((r, i) => (
              <tr key={r.id} className={i % 2 ? "bg-off-black" : "bg-card-bg"}>
                <td className="px-4 py-3"><div className="flex items-center gap-2"><AlertTriangle className="h-3.5 w-3.5 text-gold" />{r.name}</div></td>
                <td className="px-4 py-3 text-muted-foreground">{triggerLabel[r.trigger] ?? r.trigger}</td>
                <td className="px-4 py-3 font-mono text-gold">{r.thresholdDays}d</td>
                <td className="px-4 py-3">
                  <button
                    type="button"
                    onClick={() => handleToggleEnabled(r)}
                    disabled={updateRule.isPending}
                    className="inline-flex"
                    title={r.enabled ? "Click to disable this rule" : "Click to enable this rule"}
                  >
                    <StatusBadge status={r.enabled ? "ACTIVE" : "CLOSED"} />
                  </button>
                </td>
                <td className="px-4 py-3">
                  <div className="flex justify-end gap-1.5">
                    <button
                      type="button"
                      onClick={() => setRuleDialog({ mode: "edit", rule: r })}
                      className="p-1.5 text-muted-foreground hover:text-gold transition-colors"
                      title="Edit rule"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(r)}
                      disabled={deleteRule.isPending}
                      className="p-1.5 text-muted-foreground hover:text-destructive transition-colors disabled:opacity-40"
                      title="Delete rule"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {rules.length === 0 && <tr><td colSpan={5} className="p-6 text-center text-sm text-muted-foreground">No rules configured. Click "Add Rule" to create one.</td></tr>}
          </tbody>
        </table>
      </Bento>

      <Bento className="overflow-hidden">
        <div className="p-4 border-b border-line flex items-center justify-between">
          <h2 className="font-display font-bold">Escalation Events</h2>
          <span className="label-eyebrow">{events.length} events</span>
        </div>
        <table className="w-full text-left text-sm">
          <thead className="bg-background">
            <tr className="text-[10px] tracking-widest uppercase text-muted-foreground">
              <th className="px-4 py-3 font-medium">Timestamp</th>
              <th className="px-4 py-3 font-medium">Rule</th>
              <th className="px-4 py-3 font-medium">Level</th>
              <th className="px-4 py-3 font-medium">Target → Escalated To</th>
              <th className="px-4 py-3 font-medium">Reason</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {events.map((e, i) => (
              <tr key={e.id} className={`${i % 2 ? "bg-off-black" : "bg-card-bg"} ${e.resolved ? "opacity-60" : ""}`}>
                <td className="px-4 py-3 font-mono text-xs text-gold">{format(new Date(e.createdAt), "yyyy-MM-dd HH:mm")}</td>
                <td className="px-4 py-3">{e.rule.name}</td>
                <td className="px-4 py-3"><span className="text-[10px] tracking-widest uppercase border border-gold/60 text-gold px-2 py-0.5">{levelLabel[e.level] ?? `L${e.level}`}</span></td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-1.5 text-xs">
                    <span>{e.target.name}</span>
                    <ArrowRight className="h-3 w-3 text-muted-foreground" />
                    <span className="text-gold">{e.escalatedTo.name}</span>
                  </div>
                </td>
                <td className="px-4 py-3 text-xs text-muted-foreground">{e.reason}</td>
                <td className="px-4 py-3 text-xs">
                  {e.resolved
                    ? <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-widest bg-gold/15 text-gold px-2 py-0.5"><Check className="h-3 w-3" />Resolved</span>
                    : <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-widest border border-destructive/60 text-destructive px-2 py-0.5">Open</span>}
                </td>
                <td className="px-4 py-3 text-right">
                  {!e.resolved && (
                    <button
                      onClick={() => handleResolve(e.id)}
                      disabled={resolve.isPending}
                      className="text-xs text-gold hover:text-gold-hover disabled:opacity-40 inline-flex items-center gap-1"
                    >
                      <Check className="h-3 w-3" /> Mark resolved
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {events.length === 0 && <tr><td colSpan={7} className="p-6 text-center text-sm text-muted-foreground">No escalation events yet. Run the engine to generate some.</td></tr>}
          </tbody>
        </table>
      </Bento>

      {ruleDialog && (
        <RuleDialog
          state={ruleDialog}
          onClose={() => setRuleDialog(null)}
          onSubmit={(payload) => {
            if (ruleDialog.mode === "create") {
              createRule.mutate(payload, {
                onSuccess: () => {
                  toast.success(`Rule "${payload.name}" created`);
                  setRuleDialog(null);
                },
                onError: (err) => toast.error(err instanceof Error ? err.message : "Create failed"),
              });
            } else {
              updateRule.mutate(
                { id: ruleDialog.rule.id, patch: payload },
                {
                  onSuccess: () => {
                    toast.success(`Rule "${payload.name}" updated`);
                    setRuleDialog(null);
                  },
                  onError: (err) => toast.error(err instanceof Error ? err.message : "Update failed"),
                },
              );
            }
          }}
          isPending={createRule.isPending || updateRule.isPending}
        />
      )}
    </div>
  );
}

function RuleDialog({
  state,
  onClose,
  onSubmit,
  isPending,
}: {
  state: { mode: "create" } | { mode: "edit"; rule: EscalationRule };
  onClose: () => void;
  onSubmit: (payload: EscalationRuleInput) => void;
  isPending: boolean;
}) {
  const initial = state.mode === "edit" ? state.rule : null;
  const [name, setName] = useState(initial?.name ?? "");
  const [trigger, setTrigger] = useState<EscalationRuleInput["trigger"]>(
    initial?.trigger ?? "GOAL_NOT_SUBMITTED",
  );
  const [thresholdDays, setThresholdDays] = useState<number>(initial?.thresholdDays ?? 7);
  const [enabled, setEnabled] = useState<boolean>(initial?.enabled ?? true);
  const [error, setError] = useState<string | null>(null);

  const handleSave = () => {
    setError(null);
    const trimmed = name.trim();
    if (trimmed.length < 2) {
      setError("Name must be at least 2 characters.");
      return;
    }
    if (!Number.isFinite(thresholdDays) || thresholdDays < 1 || thresholdDays > 90) {
      setError("Threshold must be between 1 and 90 days.");
      return;
    }
    onSubmit({ name: trimmed, trigger, thresholdDays, enabled });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm p-4">
      <div className="bento w-full max-w-md p-5 space-y-4 relative">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-xl font-bold">
            {state.mode === "create" ? "Add Escalation Rule" : "Edit Rule"}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground transition-colors"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-3 text-sm">
          <div className="space-y-1.5">
            <label className="label-eyebrow">Name</label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Check-in delay"
              maxLength={80}
            />
          </div>

          <div className="space-y-1.5">
            <label className="label-eyebrow">Trigger</label>
            <select
              value={trigger}
              onChange={(e) => setTrigger(e.target.value as EscalationRuleInput["trigger"])}
              className="w-full bg-background border border-line text-foreground px-3 py-2 text-sm focus:outline-none focus:border-gold/60"
            >
              <option value="GOAL_NOT_SUBMITTED">Employee hasn't submitted goals</option>
              <option value="APPROVAL_PENDING">Manager hasn't approved</option>
              <option value="CHECKIN_INCOMPLETE">Check-in not completed in window</option>
            </select>
          </div>

          <div className="space-y-1.5">
            <label className="label-eyebrow">Threshold (days)</label>
            <Input
              type="number"
              min={1}
              max={90}
              value={thresholdDays}
              onChange={(e) => setThresholdDays(Number(e.target.value))}
            />
            <p className="text-[11px] text-muted-foreground">
              Once a target is older than this many days without action, the rule fires.
            </p>
          </div>

          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={enabled}
              onChange={(e) => setEnabled(e.target.checked)}
              className="h-4 w-4 accent-gold"
            />
            <span className="text-sm">Enabled</span>
            <span className={`ml-auto text-[10px] uppercase tracking-widest px-2 py-0.5 border ${enabled ? "border-gold text-gold" : "border-line text-muted-foreground"}`}>
              {enabled ? "ACTIVE" : "PAUSED"}
            </span>
          </label>

          {error && <div className="text-xs text-destructive">{error}</div>}
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <OutlineButton onClick={onClose} disabled={isPending} className="text-xs py-1.5 px-3">
            Cancel
          </OutlineButton>
          <GoldButton onClick={handleSave} disabled={isPending} className="text-xs py-1.5 px-3">
            {isPending ? "Saving…" : state.mode === "create" ? "Create rule" : "Save changes"}
          </GoldButton>
        </div>
      </div>
    </div>
  );
}
