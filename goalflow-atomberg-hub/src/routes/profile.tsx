import { createFileRoute, Link } from "@tanstack/react-router";
import { useStore } from "@/lib/store";
import { useUsers } from "@/api/hooks";
import { guardAuthenticated } from "@/lib/auth-guard";
import { Bento, Eyebrow, GoldBar } from "@/components/ui-kit";
import { RouteError } from "@/components/Skeleton";
import { Mail, Building2, Shield, UserCircle2, ArrowRight, ChevronRight, type LucideIcon } from "lucide-react";

export const Route = createFileRoute("/profile")({
  beforeLoad: ({ context }) => guardAuthenticated(context),
  component: ProfilePage,
  errorComponent: ({ error, reset }) => <RouteError error={error} reset={reset} />,
});

function ProfilePage() {
  const user = useStore((s) => s.currentUser!);
  const usersQ = useUsers();
  const allUsers = usersQ.data ?? [];

  const manager = user.managerId ? allUsers.find((u) => u.id === user.managerId) : null;
  const directReports = allUsers.filter((u) => u.managerId === user.id);
  const initials = user.name.split(" ").map((p) => p[0]).join("");

  const roleBadge =
    user.role === "ADMIN"
      ? "bg-gold text-black"
      : user.role === "MANAGER"
      ? "border border-gold text-gold"
      : "border border-foreground/30 text-foreground";

  return (
    <div className="max-w-5xl">
        <Eyebrow>Account</Eyebrow>
        <h1 className="font-display text-3xl font-bold mt-1 mb-2">My Profile</h1>
        <p className="text-sm text-muted-foreground mb-6">Your Atomberg directory details. To update name, role, or reporting line, contact an Admin.</p>
        <GoldBar value={100} />

        <div className="mt-8 grid grid-cols-1 lg:grid-cols-3 gap-4">
          <Bento className="p-6 lg:col-span-2">
            <div className="flex items-start gap-5">
              <div className="h-20 w-20 bg-gold/10 border border-gold/30 flex items-center justify-center text-gold font-display font-bold text-2xl shrink-0">
                {initials}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-3 flex-wrap">
                  <h2 className="font-display text-2xl font-bold">{user.name}</h2>
                  <span className={`text-[10px] px-2 py-0.5 ${roleBadge}`}>{user.role}</span>
                </div>
                <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                  <ProfileField icon={Mail} label="Email" value={user.email} mono />
                  <ProfileField icon={Building2} label="Department" value={user.department} />
                  <ProfileField icon={Shield} label="Role" value={titleCase(user.role)} />
                  <ProfileField icon={UserCircle2} label="Reports to" value={manager?.name ?? "—"} />
                </div>
              </div>
            </div>
          </Bento>

          <Bento className="p-5">
            <Eyebrow>Quick links</Eyebrow>
            <div className="mt-3 flex flex-col gap-2">
              {user.role === "EMPLOYEE" && (
                <>
                  <NavRow to="/employee/dashboard" label="My dashboard" />
                  <NavRow to="/employee/goals" label="My goals" />
                  <NavRow to="/employee/check-in" label="Quarterly check-in" />
                </>
              )}
              {user.role === "MANAGER" && (
                <>
                  <NavRow to="/manager/dashboard" label="Team dashboard" />
                  <NavRow to="/analytics" label="Analytics" />
                </>
              )}
              {user.role === "ADMIN" && (
                <>
                  <NavRow to="/admin/cycles" label="Cycle management" />
                  <NavRow to="/admin/hierarchy" label="Org hierarchy" />
                  <NavRow to="/admin/audit" label="Audit log" />
                </>
              )}
              <NavRow to="/settings" label="Account settings" />
            </div>
          </Bento>
        </div>

        {user.role === "MANAGER" && directReports.length > 0 && (
          <Bento className="mt-4 p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <Eyebrow>Direct reports</Eyebrow>
                <h3 className="font-display text-lg font-bold mt-1">{directReports.length} team members</h3>
              </div>
              <Link to="/manager/dashboard" className="text-xs text-gold hover:text-gold-hover inline-flex items-center gap-1">
                Open team dashboard <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
            <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {directReports.map((r) => (
                <li key={r.id}>
                  <Link
                    to="/manager/team/$employeeId"
                    params={{ employeeId: r.id }}
                    className="flex items-center gap-3 p-3 border border-line hover:border-gold/50 hover:bg-card-bg transition-colors"
                  >
                    <div className="h-8 w-8 bg-gold/10 border border-gold/30 flex items-center justify-center text-[10px] text-gold font-bold shrink-0">
                      {r.name.split(" ").map((p) => p[0]).join("")}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm truncate">{r.name}</div>
                      <div className="text-[11px] text-muted-foreground font-mono truncate">{r.department}</div>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          </Bento>
        )}
      </div>
  );
}

function ProfileField({ icon: Icon, label, value, mono }: { icon: LucideIcon; label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-start gap-2.5">
      <Icon className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
      <div className="min-w-0">
        <div className="label-eyebrow">{label}</div>
        <div className={`text-sm truncate ${mono ? "font-mono text-foreground" : ""}`}>{value}</div>
      </div>
    </div>
  );
}

function NavRow({ to, label }: { to: string; label: string }) {
  return (
    <Link
      to={to}
      className="flex items-center justify-between gap-2 px-3 py-2 text-sm border border-line hover:border-gold/50 hover:bg-card-bg transition-colors group"
    >
      <span>{label}</span>
      <ChevronRight className="h-3.5 w-3.5 text-muted-foreground group-hover:text-gold transition-colors" />
    </Link>
  );
}

function titleCase(s: string) {
  return s.charAt(0) + s.slice(1).toLowerCase();
}
