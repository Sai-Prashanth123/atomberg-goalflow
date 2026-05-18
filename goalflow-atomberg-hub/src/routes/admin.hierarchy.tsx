import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useStore } from "@/lib/store";
import { useUsers, useCreateUser, useSyncHierarchy, type SyncHierarchyResult } from "@/api/hooks";
import { guardRoute } from "@/lib/auth-guard";
import type { Role } from "@/api/types";
import { Bento, Chip, Eyebrow, GoldButton, Input, OutlineButton } from "@/components/ui-kit";
import { Plus, X, AlertCircle, UserPlus, Network, RefreshCw, Mail } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/admin/hierarchy")({
  beforeLoad: ({ context }) => guardRoute(context, ["ADMIN"]),
  component: Hierarchy,
});

function Hierarchy() {
  const users = useUsers().data ?? [];
  const create = useCreateUser();
  const sync = useSyncHierarchy();
  const [createOpen, setCreateOpen] = useState(false);
  const [syncResult, setSyncResult] = useState<SyncHierarchyResult | null>(null);

  const handleSync = async () => {
    try {
      const result = await sync.mutateAsync();
      setSyncResult(result);
      const msg = result.missing.length === 0
        ? `All ${result.total} users have a manager linked`
        : `${result.missing.length} user${result.missing.length === 1 ? "" : "s"} still need to sign in via Microsoft`;
      toast.success(`Entra ID sync triggered — ${msg}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Sync failed");
    }
  };

  const admins = users.filter((u) => u.role === "ADMIN");
  const managers = users.filter((u) => u.role === "MANAGER");
  const employees = users.filter((u) => u.role === "EMPLOYEE");

  const cardClass = (role: string) =>
    `bento px-4 py-3 min-w-[180px] text-center ${role === "ADMIN" ? "border-gold" : role === "MANAGER" ? "border-foreground/40" : "border-line"}`;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="font-display text-3xl font-bold">Org Hierarchy</h1>
        <div className="flex gap-2 flex-wrap">
          <OutlineButton
            onClick={handleSync}
            disabled={sync.isPending}
            className="flex items-center gap-2"
            title="Reports hierarchy + role sync status. Per-user sync runs at every SSO login."
          >
            <RefreshCw className={`h-3.5 w-3.5 ${sync.isPending ? "animate-spin" : ""}`} />
            {sync.isPending ? "Syncing…" : "Sync from Entra ID"}
          </OutlineButton>
          <OutlineButton onClick={() => setCreateOpen(true)} className="flex items-center gap-2">
            <UserPlus className="h-3.5 w-3.5" /> Add User
          </OutlineButton>
        </div>
      </div>

      {syncResult && (
        <Bento className="p-4 border-l-2 border-gold">
          <div className="flex items-start gap-3 flex-wrap">
            <div className="flex-1 min-w-0">
              <Eyebrow>Entra ID Sync</Eyebrow>
              <div className="text-sm mt-1">
                <span className="text-foreground font-medium">{syncResult.withManager}</span>
                <span className="text-muted-foreground"> of </span>
                <span className="text-foreground font-medium">{syncResult.total}</span>
                <span className="text-muted-foreground"> users linked to a manager</span>
                {syncResult.missing.length > 0 && (
                  <span className="text-destructive ml-2">· {syncResult.missing.length} pending</span>
                )}
              </div>
              <p className="text-[11px] text-muted-foreground mt-2 leading-relaxed">{syncResult.note}</p>
              {syncResult.missing.length > 0 && (
                <ul className="mt-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-1.5">
                  {syncResult.missing.map((u) => (
                    <li key={u.id} className="text-xs flex items-center gap-2 border border-line/60 px-2 py-1.5 bg-card-bg/40">
                      <Mail className="h-3 w-3 text-muted-foreground shrink-0" />
                      <span className="truncate">{u.name}</span>
                      <span className="text-muted-foreground truncate">· {u.email}</span>
                      <span className="text-[9px] tracking-widest uppercase text-muted-foreground ml-auto shrink-0">{u.role}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <button
              onClick={() => setSyncResult(null)}
              className="text-xs text-muted-foreground hover:text-foreground"
              aria-label="Dismiss sync result"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </Bento>
      )}

      {users.length === 0 ? (
        <Bento className="p-12 text-center">
          <Network className="h-10 w-10 text-gold mx-auto mb-3 opacity-70" />
          <h3 className="font-display font-bold mb-1">No users in the directory yet</h3>
          <p className="text-sm text-muted-foreground mb-5 max-w-md mx-auto">
            Seed your organization by adding the first admin, manager, and employee accounts.
            Once managers are in place you can assign direct reports.
          </p>
          <OutlineButton onClick={() => setCreateOpen(true)} className="inline-flex items-center gap-2">
            <UserPlus className="h-3.5 w-3.5" /> Add your first user
          </OutlineButton>
        </Bento>
      ) : (
        <Bento className="p-10 overflow-x-auto">
          <div className="flex flex-col items-center gap-8 min-w-[800px]">
            <div className="flex gap-6 flex-wrap justify-center">
              {admins.length === 0
                ? <div className="text-xs text-muted-foreground italic">No admins yet — promote a user via the Add User dialog.</div>
                : admins.map((a) => <div key={a.id} className={cardClass("ADMIN")}><div className="font-display font-bold">{a.name}</div><div className="text-[11px] text-gold tracking-widest uppercase mt-1">Admin · {a.department}</div></div>)}
            </div>
            <div className="h-8 w-px bg-gold/40" />
            <div className="flex gap-6 flex-wrap justify-center">
              {managers.length === 0
                ? <div className="text-xs text-muted-foreground italic">No managers yet.</div>
                : managers.map((m) => <div key={m.id} className={cardClass("MANAGER")}><div className="font-display font-bold">{m.name}</div><div className="text-[11px] text-foreground/60 tracking-widest uppercase mt-1">Manager · {m.department}</div></div>)}
            </div>
            <div className="h-8 w-px bg-gold/40" />
            <div className="flex gap-4 flex-wrap justify-center">
              {employees.length === 0
                ? <div className="text-xs text-muted-foreground italic">No employees yet.</div>
                : employees.map((e) => <div key={e.id} className={cardClass("EMPLOYEE")}><div className="text-sm font-medium">{e.name}</div><div className="text-[11px] text-muted-foreground tracking-widest uppercase mt-1">{e.department}</div></div>)}
            </div>
          </div>
        </Bento>
      )}

      {createOpen && <CreateUserDialog onClose={() => setCreateOpen(false)} mutator={create} managers={[...admins, ...managers]} />}
    </div>
  );
}

function CreateUserDialog({
  onClose,
  mutator,
  managers,
}: {
  onClose: () => void;
  mutator: ReturnType<typeof useCreateUser>;
  managers: Array<{ id: string; name: string; role: Role; department: string }>;
}) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<Role>("EMPLOYEE");
  const [department, setDepartment] = useState("");
  const [managerId, setManagerId] = useState<string>(managers[0]?.id ?? "");
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setError(null);
    if (!name.trim() || name.length < 2) return setError("Name is required (≥ 2 chars)");
    if (!email.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)) return setError("Valid email required");
    if (password.length < 8) return setError("Password ≥ 8 chars");
    if (!department.trim()) return setError("Department is required");
    try {
      await mutator.mutateAsync({
        name: name.trim(),
        email: email.trim(),
        password,
        role,
        department: department.trim(),
        managerId: role === "ADMIN" ? null : managerId || null,
      });
      toast.success(`Added ${name.trim()} (${role})`);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create user");
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white border border-line shadow-2xl shadow-foreground/10 w-full max-w-md max-h-[90vh] overflow-y-auto animate-in zoom-in-95 duration-200">
        <div className="flex items-center justify-between p-5 border-b border-line">
          <h3 className="font-display font-bold text-lg">Add User</h3>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
        </div>
        <div className="p-5 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div><Eyebrow>Name</Eyebrow><Input className="mt-1" value={name} onChange={(e) => setName(e.target.value)} /></div>
            <div><Eyebrow>Department</Eyebrow><Input className="mt-1" value={department} onChange={(e) => setDepartment(e.target.value)} placeholder="Product / Sales / Ops" /></div>
          </div>
          <div><Eyebrow>Email</Eyebrow><Input type="email" className="mt-1" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="user@atomberg.com" /></div>
          <div><Eyebrow>Initial Password</Eyebrow><Input type="password" className="mt-1" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="≥ 8 chars" /></div>
          <div>
            <Eyebrow>Role</Eyebrow>
            <div className="mt-1 flex gap-2">
              {(["EMPLOYEE", "MANAGER", "ADMIN"] as Role[]).map((r) => (
                <Chip key={r} active={role === r} onClick={() => setRole(r)}>{r}</Chip>
              ))}
            </div>
          </div>
          {role !== "ADMIN" && (
            <div>
              <Eyebrow>Reports To</Eyebrow>
              <select value={managerId} onChange={(e) => setManagerId(e.target.value)} className="w-full mt-1 bg-white border border-line text-foreground px-3 py-2.5 text-sm focus:outline-none focus:border-gold focus:ring-2 focus:ring-gold/25 transition-all">
                {managers.map((m) => <option key={m.id} value={m.id}>{m.name} — {m.role} · {m.department}</option>)}
              </select>
            </div>
          )}
          {error && <p className="text-xs text-destructive flex items-center gap-1"><AlertCircle className="h-3 w-3" />{error}</p>}
        </div>
        <div className="p-5 border-t border-line flex justify-end gap-3">
          <OutlineButton onClick={onClose}>Cancel</OutlineButton>
          <GoldButton disabled={mutator.isPending} onClick={submit}>
            {mutator.isPending ? "Creating…" : "Create User"}
          </GoldButton>
        </div>
      </div>
    </div>
  );
}
