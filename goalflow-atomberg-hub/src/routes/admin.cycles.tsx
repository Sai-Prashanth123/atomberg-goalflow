import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useStore } from "@/lib/store";
import { useCycles, useTransitionCycle, useCreateCycle, useUpdateCycle } from "@/api/hooks";
import type { Cycle } from "@/api/types";
import { guardRoute } from "@/lib/auth-guard";
import { Bento, Eyebrow, GoldButton, Input, OutlineButton, Chip, StatusBadge } from "@/components/ui-kit";
import { Plus, X, AlertCircle } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";

export const Route = createFileRoute("/admin/cycles")({
  beforeLoad: ({ context }) => guardRoute(context, ["ADMIN"]),
  component: CyclesPage,
});

type CycleKind = "GOAL_SETTING" | "Q1" | "Q2" | "Q3" | "Q4";

function CyclesPage() {
  const cycles = useCycles().data ?? [];
  const transition = useTransitionCycle();
  const create = useCreateCycle();
  const update = useUpdateCycle();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Cycle | null>(null);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-3xl font-bold">Cycle Management</h1>
        <span className="label-eyebrow">{cycles.length} cycles · FY{new Date().getFullYear()}</span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
        {cycles.map((c) => (
          <Bento key={c.id} className="p-5" hover>
            <div className="flex items-start justify-between">
              <h3 className="font-display font-bold">{c.name}</h3>
              <StatusBadge status={c.status} />
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3 text-xs">
              <div><Eyebrow>Open</Eyebrow><div className="font-mono text-gold mt-1">{format(new Date(c.openDate), "dd MMM yyyy")}</div></div>
              <div><Eyebrow>Close</Eyebrow><div className="font-mono text-gold mt-1">{format(new Date(c.closeDate), "dd MMM yyyy")}</div></div>
            </div>
            <div className="mt-5 flex gap-2">
              <OutlineButton className="flex-1 text-xs py-2" onClick={() => setEditing(c)}>Edit Cycle</OutlineButton>
              <button
                onClick={() => transition.mutate(
                  { id: c.id, status: c.status === "ACTIVE" ? "CLOSED" : "ACTIVE" },
                  {
                    onSuccess: () => toast.success(`${c.name} ${c.status === "ACTIVE" ? "closed" : "opened"}`),
                    onError: (er) => toast.error(er instanceof Error ? er.message : "Cycle transition failed"),
                  },
                )}
                disabled={transition.isPending}
                className="flex-1 text-xs border border-line text-muted-foreground py-2 hover:text-foreground hover:border-foreground/30 transition disabled:opacity-50"
              >
                {c.status === "ACTIVE" ? "Close Window" : "Open Window"}
              </button>
            </div>
          </Bento>
        ))}

        <button
          onClick={() => setOpen(true)}
          className="bento p-5 border-dashed flex flex-col items-center justify-center min-h-[200px] text-muted-foreground hover:text-gold hover:border-gold transition cursor-pointer"
        >
          <Plus className="h-6 w-6 mb-2" />
          <span className="font-display text-sm">Create New Cycle</span>
        </button>
      </div>

      {open && <CreateCycleDialog onClose={() => setOpen(false)} mutator={create} />}
      {editing && <EditCycleDialog onClose={() => setEditing(null)} mutator={update} cycle={editing} />}
    </div>
  );
}

function EditCycleDialog({
  onClose,
  mutator,
  cycle,
}: {
  onClose: () => void;
  mutator: ReturnType<typeof useUpdateCycle>;
  cycle: Cycle;
}) {
  // Re-use the same field set as the Create dialog. Pre-populate from the cycle.
  const [name, setName] = useState(cycle.name);
  const [kind, setKind] = useState<CycleKind>(cycle.kind as CycleKind);
  const [openDate, setOpenDate] = useState(cycle.openDate.slice(0, 10));
  const [closeDate, setCloseDate] = useState(cycle.closeDate.slice(0, 10));
  const [fiscalYear, setFiscalYear] = useState(cycle.fiscalYear);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setError(null);
    if (!name.trim() || name.length < 2) return setError("Name is required");
    if (new Date(closeDate) <= new Date(openDate)) return setError("Close date must be after open date");
    try {
      await mutator.mutateAsync({
        id: cycle.id,
        patch: {
          name: name.trim(),
          kind,
          openDate: new Date(openDate).toISOString(),
          closeDate: new Date(closeDate).toISOString(),
          fiscalYear,
        },
      });
      toast.success(`Cycle "${name.trim()}" updated`);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update cycle");
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white border border-line shadow-2xl shadow-foreground/10 w-full max-w-md max-h-[90vh] overflow-y-auto animate-in zoom-in-95 duration-200">
        <div className="flex items-center justify-between p-5 border-b border-line">
          <h3 className="font-display font-bold text-lg">Edit Cycle</h3>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
        </div>
        <div className="p-5 space-y-4">
          <div>
            <Eyebrow>Name</Eyebrow>
            <Input className="mt-1" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <Eyebrow>Kind</Eyebrow>
            <div className="mt-1 flex flex-wrap gap-2">
              {(["GOAL_SETTING", "Q1", "Q2", "Q3", "Q4"] as CycleKind[]).map((k) => (
                <Chip key={k} active={kind === k} onClick={() => setKind(k)}>{k === "GOAL_SETTING" ? "Goal Setting" : k}</Chip>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Eyebrow>Open Date</Eyebrow>
              <Input type="date" className="mt-1" value={openDate} onChange={(e) => setOpenDate(e.target.value)} />
            </div>
            <div>
              <Eyebrow>Close Date</Eyebrow>
              <Input type="date" className="mt-1" value={closeDate} onChange={(e) => setCloseDate(e.target.value)} />
            </div>
          </div>
          <div>
            <Eyebrow>Fiscal Year</Eyebrow>
            <Input className="mt-1" value={fiscalYear} onChange={(e) => setFiscalYear(e.target.value)} />
          </div>
          <p className="text-[11px] text-muted-foreground">
            The auto-transition scheduler will reconcile this cycle's <b>status</b> against the new dates on the next daily tick (or after a backend restart).
          </p>
          {error && (
            <p className="text-xs text-destructive flex items-center gap-1"><AlertCircle className="h-3 w-3" />{error}</p>
          )}
        </div>
        <div className="p-5 border-t border-line flex justify-end gap-3">
          <OutlineButton onClick={onClose}>Cancel</OutlineButton>
          <GoldButton disabled={mutator.isPending} onClick={submit}>
            {mutator.isPending ? "Saving…" : "Save Changes"}
          </GoldButton>
        </div>
      </div>
    </div>
  );
}

function CreateCycleDialog({ onClose, mutator }: { onClose: () => void; mutator: ReturnType<typeof useCreateCycle> }) {
  const year = new Date().getFullYear();
  const [name, setName] = useState("");
  const [kind, setKind] = useState<CycleKind>("Q1");
  const [openDate, setOpenDate] = useState(`${year}-04-01`);
  const [closeDate, setCloseDate] = useState(`${year}-04-30`);
  const [fiscalYear, setFiscalYear] = useState(String(year));
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setError(null);
    if (!name.trim() || name.length < 2) return setError("Name is required");
    if (new Date(closeDate) <= new Date(openDate)) return setError("Close date must be after open date");
    try {
      await mutator.mutateAsync({
        name: name.trim(),
        kind,
        openDate: new Date(openDate).toISOString(),
        closeDate: new Date(closeDate).toISOString(),
        fiscalYear,
      });
      toast.success(`Cycle "${name.trim()}" created`);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create cycle");
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white border border-line shadow-2xl shadow-foreground/10 w-full max-w-md max-h-[90vh] overflow-y-auto animate-in zoom-in-95 duration-200">
        <div className="flex items-center justify-between p-5 border-b border-line">
          <h3 className="font-display font-bold text-lg">Create New Cycle</h3>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
        </div>
        <div className="p-5 space-y-4">
          <div>
            <Eyebrow>Name</Eyebrow>
            <Input className="mt-1" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Q2 Check-in" />
          </div>
          <div>
            <Eyebrow>Kind</Eyebrow>
            <div className="mt-1 flex flex-wrap gap-2">
              {(["GOAL_SETTING", "Q1", "Q2", "Q3", "Q4"] as CycleKind[]).map((k) => (
                <Chip key={k} active={kind === k} onClick={() => setKind(k)}>{k === "GOAL_SETTING" ? "Goal Setting" : k}</Chip>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Eyebrow>Open Date</Eyebrow>
              <Input type="date" className="mt-1" value={openDate} onChange={(e) => setOpenDate(e.target.value)} />
            </div>
            <div>
              <Eyebrow>Close Date</Eyebrow>
              <Input type="date" className="mt-1" value={closeDate} onChange={(e) => setCloseDate(e.target.value)} />
            </div>
          </div>
          <div>
            <Eyebrow>Fiscal Year</Eyebrow>
            <Input className="mt-1" value={fiscalYear} onChange={(e) => setFiscalYear(e.target.value)} placeholder="2026" />
          </div>
          {error && (
            <p className="text-xs text-destructive flex items-center gap-1"><AlertCircle className="h-3 w-3" />{error}</p>
          )}
        </div>
        <div className="p-5 border-t border-line flex justify-end gap-3">
          <OutlineButton onClick={onClose}>Cancel</OutlineButton>
          <GoldButton disabled={mutator.isPending} onClick={submit}>
            {mutator.isPending ? "Creating…" : "Create Cycle"}
          </GoldButton>
        </div>
      </div>
    </div>
  );
}
