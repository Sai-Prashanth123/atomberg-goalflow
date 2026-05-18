import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useStore } from "@/lib/store";
import { useUsers, usePushSharedGoal, useGoals } from "@/api/hooks";
import type { ThrustArea, UoM, Direction } from "@/api/types";
import { THRUST_AREAS, UOMS, THRUST_LABEL, UOM_LABEL } from "@/api/types";
import { guardRoute } from "@/lib/auth-guard";
import { Bento, Chip, Eyebrow, GoldButton, Input, Textarea } from "@/components/ui-kit";
import { AlertCircle } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/admin/shared-goals")({
  beforeLoad: ({ context }) => guardRoute(context, ["ADMIN", "MANAGER"]),
  component: SharedGoals,
});

function SharedGoals() {
  const usersQ = useUsers();
  const allGoals = useGoals().data ?? [];
  const users = (usersQ.data ?? []).filter((u) => u.role === "EMPLOYEE");
  const push = usePushSharedGoal();

  const [title, setTitle] = useState("");
  const [desc, setDesc] = useState("");
  const [target, setTarget] = useState(100);
  const [uom, setUom] = useState<UoM>("NUMERIC");
  const [direction, setDirection] = useState<Direction>("MIN");
  const [thrust, setThrust] = useState<ThrustArea>("OPERATIONAL_EXCELLENCE");
  const [primaryOwnerId, setPrimaryOwnerId] = useState<string>(users[0]?.id ?? "");
  const [recipients, setRecipients] = useState<string[]>([]);
  const [weightagePerRecipient, setWeightagePerRecipient] = useState(10);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const toggle = (id: string) => setRecipients((r) => (r.includes(id) ? r.filter((x) => x !== id) : [...r, id]));

  // Group existing shared goals by primary
  const shared = allGoals
    .filter((g) => g.isSharedPrimary)
    .map((p) => ({ ...p, cloneCount: allGoals.filter((c) => c.sharedPrimaryId === p.id).length }));

  const submit = async () => {
    setError(null);
    setSuccess(null);
    if (!primaryOwnerId) return setError("Pick a primary owner");
    if (recipients.length === 0) return setError("Select at least one recipient");
    try {
      await push.mutateAsync({
        title, description: desc, target, uom, direction,
        thrustArea: thrust, primaryOwnerId, recipientIds: recipients, weightagePerRecipient,
      });
      const msg = `Pushed "${title}" to ${recipients.length} employees.`;
      setSuccess(msg);
      toast.success(msg);
      setTitle("");
      setDesc("");
      setRecipients([]);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Push failed";
      setError(msg);
      toast.error(msg);
    }
  };

  return (
    <div className="space-y-4">
      <h1 className="font-display text-3xl font-bold">Shared Goals</h1>

      <Bento className="p-5">
        <h2 className="font-display font-bold mb-4">Push Departmental KPI</h2>
        <p className="text-xs text-muted-foreground mb-4">
          Primary owner enters actuals; clones receive the same goal locked at title/target — recipients can only adjust weightage. Achievement syncs across all linked sheets.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div><Eyebrow>Goal Title</Eyebrow><Input className="mt-1" value={title} onChange={(e) => setTitle(e.target.value)} /></div>
          <div><Eyebrow>Target</Eyebrow><Input className="mt-1" type="number" value={target} onChange={(e) => setTarget(Number(e.target.value))} /></div>
          <div className="md:col-span-2"><Eyebrow>Description</Eyebrow><Textarea rows={2} className="mt-1" value={desc} onChange={(e) => setDesc(e.target.value)} /></div>
          <div><Eyebrow>Thrust Area</Eyebrow>
            <select value={thrust} onChange={(e) => setThrust(e.target.value as ThrustArea)} className="w-full mt-1 bg-white border border-line text-foreground px-3 py-2.5 text-sm focus:outline-none focus:border-gold focus:ring-2 focus:ring-gold/25 transition-all">
              {THRUST_AREAS.map((t) => <option key={t} value={t}>{THRUST_LABEL[t]}</option>)}
            </select>
          </div>
          <div><Eyebrow>UoM</Eyebrow>
            <div className="mt-1 flex flex-wrap gap-2">
              {UOMS.map((u) => <Chip key={u} active={uom === u} onClick={() => setUom(u)}>{UOM_LABEL[u]}</Chip>)}
            </div>
          </div>
          {(uom === "NUMERIC" || uom === "PERCENTAGE") && (
            <div className="md:col-span-2"><Eyebrow>Direction</Eyebrow>
              <div className="mt-1 flex gap-2">
                <Chip active={direction === "MIN"} onClick={() => setDirection("MIN")}>Higher is better</Chip>
                <Chip active={direction === "MAX"} onClick={() => setDirection("MAX")}>Lower is better</Chip>
              </div>
            </div>
          )}
          <div><Eyebrow>Primary Owner (enters actuals)</Eyebrow>
            <select value={primaryOwnerId} onChange={(e) => setPrimaryOwnerId(e.target.value)} className="w-full mt-1 bg-white border border-line text-foreground px-3 py-2.5 text-sm focus:outline-none focus:border-gold focus:ring-2 focus:ring-gold/25 transition-all">
              {users.map((u) => <option key={u.id} value={u.id}>{u.name} — {u.department}</option>)}
            </select>
          </div>
          <div><Eyebrow>Weight per recipient</Eyebrow><Input className="mt-1" type="number" value={weightagePerRecipient} onChange={(e) => setWeightagePerRecipient(Number(e.target.value))} /></div>
        </div>

        <div className="mt-5">
          <Eyebrow>Recipients ({recipients.length} selected)</Eyebrow>
          <div className="mt-2 grid grid-cols-1 md:grid-cols-3 gap-2">
            {users.map((u) => (
              <label key={u.id} className={`flex items-center gap-2 p-2 border cursor-pointer text-sm ${recipients.includes(u.id) ? "border-gold bg-gold/10" : "border-line"}`}>
                <input type="checkbox" checked={recipients.includes(u.id)} onChange={() => toggle(u.id)} className="accent-gold" />
                <span>{u.name} <span className="text-[11px] text-muted-foreground">· {u.department}</span></span>
              </label>
            ))}
          </div>
        </div>

        {error && <p className="mt-3 text-xs text-destructive flex items-center gap-1"><AlertCircle className="h-3 w-3" />{error}</p>}
        {success && <p className="mt-3 text-xs text-gold">{success}</p>}

        <div className="mt-5 flex justify-end">
          <GoldButton disabled={!title || recipients.length === 0 || push.isPending} onClick={submit}>
            {push.isPending ? "Pushing…" : "Push to Selected Employees"}
          </GoldButton>
        </div>
      </Bento>

      <Bento className="overflow-hidden">
        <div className="p-4 border-b border-line"><h2 className="font-display font-bold">Active Shared Goals</h2></div>
        <table className="w-full text-left text-sm">
          <thead className="bg-background">
            <tr className="text-[10px] tracking-widest uppercase text-muted-foreground">
              <th className="px-4 py-3 font-medium">Title</th>
              <th className="px-4 py-3 font-medium">Thrust Area</th>
              <th className="px-4 py-3 font-medium">Primary Owner</th>
              <th className="px-4 py-3 font-medium">Recipients</th>
            </tr>
          </thead>
          <tbody>
            {shared.map((s, i) => (
              <tr key={s.id} className={i % 2 ? "bg-off-black" : "bg-card-bg"}>
                <td className="px-4 py-3">{s.title}</td>
                <td className="px-4 py-3 text-muted-foreground">{THRUST_LABEL[s.thrustArea]}</td>
                <td className="px-4 py-3 text-muted-foreground">{s.owner?.name}</td>
                <td className="px-4 py-3"><span className="font-mono text-gold border border-gold/40 px-2 py-0.5 text-xs">{s.cloneCount}</span></td>
              </tr>
            ))}
            {shared.length === 0 && <tr><td colSpan={4} className="p-6 text-center text-sm text-muted-foreground">No shared goals yet.</td></tr>}
          </tbody>
        </table>
      </Bento>
    </div>
  );
}
