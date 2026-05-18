import { Link, useRouterState, useNavigate } from "@tanstack/react-router";
import {
  LayoutDashboard, Target, ClipboardCheck, Users, Calendar,
  Share2, Network, FileText, BarChart3, Activity, LogOut, Bell, ChevronRight, AlertTriangle, Shield, User as UserIcon, Settings,
} from "lucide-react";
import { useStore } from "@/lib/store";
import { useNotifications, useMarkAllRead, useLogout, useActiveCycle } from "@/api/hooks";
import logo from "@/assets/atomberg-logo.svg";
import { format } from "date-fns";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function AppShell({ children }: { children: React.ReactNode }) {
  const user = useStore((s) => s.currentUser);
  const setCurrentUser = useStore((s) => s.setCurrentUser);
  const logoutMut = useLogout();
  const nav = useNavigate();
  const notifsQ = useNotifications();
  const markAllRead = useMarkAllRead();
  const setOpen = useStore((s) => s.setNotificationsOpen);
  const open = useStore((s) => s.notificationsOpen);
  const path = useRouterState({ select: (r) => r.location.pathname });
  const activeCycle = useActiveCycle().data;

  // Auth pages: render bare children (login form etc) — no shell, no loader.
  if (path === "/login" || path.startsWith("/auth/")) return <>{children}</>;

  // Protected route with no hydrated user yet. We MUST NOT render the route's
  // child component here — every dashboard does `useStore(s => s.currentUser!)`
  // and would crash on null access. This applies to SSR (no localStorage) AND
  // to the brief client window between mount and /auth/me resolving.
  //
  // The guardRoute fired in beforeLoad on the client side has either:
  //   (a) already redirected to /login (we won't be here), or
  //   (b) kicked off /auth/me — when it resolves, user becomes non-null and
  //       AppShell re-renders with the full dashboard.
  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 border-2 border-gold/30 border-t-gold rounded-full animate-spin" />
          <span className="text-xs tracking-widest uppercase text-muted-foreground font-mono">Restoring session…</span>
        </div>
      </div>
    );
  }

  const role = user.role;
  const groups: { label: string; items: { to: string; label: string; icon: any }[] }[] = [];

  if (role === "EMPLOYEE") {
    groups.push({
      label: "Workspace",
      items: [
        { to: "/employee/dashboard", label: "Dashboard", icon: LayoutDashboard },
        { to: "/employee/goals", label: "My Goals", icon: Target },
        { to: "/employee/check-in", label: "Quarterly Check-in", icon: ClipboardCheck },
      ],
    });
  }
  if (role === "MANAGER") {
    groups.push({
      label: "Team",
      items: [
        { to: "/manager/dashboard", label: "Team Dashboard", icon: Users },
      ],
    });
  }
  if (role === "ADMIN") {
    groups.push({
      label: "Admin Control",
      items: [
        { to: "/admin/cycles", label: "Cycle Management", icon: Calendar },
        { to: "/admin/shared-goals", label: "Shared Goals", icon: Share2 },
        { to: "/admin/hierarchy", label: "Org Hierarchy", icon: Network },
        { to: "/admin/audit", label: "Audit Log", icon: FileText },
        { to: "/admin/reports", label: "Reports", icon: BarChart3 },
        { to: "/admin/escalations", label: "Escalations", icon: AlertTriangle },
      ],
    });
  }
  groups.push({
    label: "Insights",
    items: [{ to: "/analytics", label: "Analytics", icon: Activity }],
  });
  groups.push({
    label: "Account",
    items: [
      { to: "/profile", label: "My Profile", icon: UserIcon },
      { to: "/settings", label: "Settings", icon: Settings },
    ],
  });

  const notifs = notifsQ.data ?? [];
  const unread = notifs.filter((n) => !n.read).length;
  const cycleName = activeCycle ? `${activeCycle.name} — closes ${format(new Date(activeCycle.closeDate), "dd MMM")}` : "No active cycle";

  const crumbs = path.split("/").filter(Boolean);

  const roleBadge =
    role === "ADMIN"
      ? "bg-gold text-black"
      : role === "MANAGER"
      ? "border border-gold text-gold"
      : "border border-foreground/30 text-foreground";

  const handleLogout = async () => {
    await logoutMut.mutateAsync().catch(() => null);
    setCurrentUser(null);
    nav({ to: "/login" });
  };

  return (
    <div className="dashboard-shell grain min-h-screen flex bg-white text-foreground">
      <aside className="w-[240px] shrink-0 border-r border-[rgba(15,20,25,0.08)] bg-gradient-to-b from-[rgba(253,250,244,0.85)] via-[rgba(252,251,247,0.80)] to-[rgba(255,255,255,0.75)] backdrop-blur-2xl backdrop-saturate-150 flex flex-col fixed inset-y-0 left-0 z-30 shadow-[4px_0_32px_-12px_rgba(15,20,25,0.08)]">
        <div className="px-5 py-5 border-b border-line">
          <img src={logo} alt="Atomberg" className="h-7 w-auto" />
          <div className="mt-2 text-[11px] tracking-[0.2em] uppercase text-gold font-mono">GoalFlow</div>
        </div>
        <nav className="flex-1 overflow-y-auto py-4">
          {groups.map((g) => (
            <div key={g.label} className="mb-5">
              <div className="px-5 mb-2 label-eyebrow">{g.label}</div>
              <ul>
                {g.items.map((item) => {
                  const active = path === item.to || path.startsWith(item.to + "/");
                  const Icon = item.icon;
                  return (
                    <li key={item.to}>
                      <Link
                        to={item.to}
                        className={`flex items-center gap-3 px-5 py-2.5 text-sm transition-all relative ${
                          active
                            ? "text-foreground bg-gold/10"
                            : "text-muted-foreground hover:text-foreground hover:bg-foreground/[0.04]"
                        }`}
                      >
                        {active && <span className="absolute left-0 top-0 bottom-0 w-[2px] bg-gold" />}
                        <Icon className="h-4 w-4" />
                        <span className="flex-1">{item.label}</span>
                        {active && <span className="h-1.5 w-1.5 rounded-full bg-gold" />}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>
        <div className="border-t border-line p-4">
          <div className="bento p-3 flex items-center gap-3">
            <div className="h-9 w-9 bg-gold/10 border border-gold/30 flex items-center justify-center text-gold font-display font-bold">
              {user.name.split(" ").map((p) => p[0]).join("")}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-xs font-medium truncate">{user.name}</div>
              <span className={`mt-0.5 inline-block text-[10px] px-1.5 py-0.5 ${roleBadge}`}>{role}</span>
            </div>
            <button
              onClick={handleLogout}
              className="text-muted-foreground hover:text-gold transition-colors"
              title="Sign out"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </aside>

      <div className="flex-1 ml-[240px] flex flex-col min-h-screen">
        <header className="h-14 border-b border-[rgba(15,20,25,0.08)] bg-gradient-to-r from-[rgba(253,250,244,0.85)] to-[rgba(255,255,255,0.80)] backdrop-blur-2xl backdrop-saturate-150 px-6 flex items-center justify-between sticky top-0 z-20 shadow-[0_4px_20px_-12px_rgba(15,20,25,0.08)]">
          <div className="flex items-center gap-2 text-xs">
            {crumbs.length === 0 ? (
              <span className="text-muted-foreground">Home</span>
            ) : (
              crumbs.map((c, i) => (
                <span key={i} className="flex items-center gap-2">
                  {i > 0 && <ChevronRight className="h-3 w-3 text-muted-foreground" />}
                  <span className={i === crumbs.length - 1 ? "text-foreground" : "text-muted-foreground"}>
                    {c.replace(/-/g, " ")}
                  </span>
                </span>
              ))
            )}
          </div>

          <div className="flex items-center gap-1.5 border border-gold/50 px-3 py-1.5 text-xs font-mono">
            <span className="h-1.5 w-1.5 bg-gold rounded-full pulse-gold" />
            <span className="text-gold">{cycleName}</span>
          </div>

          <div className="flex items-center gap-4">
            <button
              onClick={() => setOpen(!open)}
              className="relative text-muted-foreground hover:text-foreground transition-colors"
              aria-label="Notifications"
            >
              <Bell className="h-5 w-5" />
              {unread > 0 && (
                <span className="absolute -top-0.5 -right-0.5 h-2 w-2 bg-gold rounded-full" />
              )}
            </button>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  className="h-8 w-8 bg-gold/10 border border-gold/30 flex items-center justify-center text-[11px] text-gold font-bold hover:bg-gold/20 transition-colors outline-none focus-visible:ring-2 focus-visible:ring-gold"
                  aria-label="Account menu"
                >
                  {user.name.split(" ").map((p) => p[0]).join("")}
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" sideOffset={8} className="w-64 bg-off-black border-line">
                <DropdownMenuLabel className="px-3 py-2">
                  <div className="flex items-center gap-3">
                    <div className="h-9 w-9 bg-gold/10 border border-gold/30 flex items-center justify-center text-gold font-display font-bold shrink-0">
                      {user.name.split(" ").map((p) => p[0]).join("")}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium text-foreground truncate">{user.name}</div>
                      <div className="text-[11px] text-muted-foreground font-mono truncate">{user.email}</div>
                      <span className={`mt-1 inline-block text-[10px] px-1.5 py-0.5 ${roleBadge}`}>{role}</span>
                    </div>
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator className="bg-line" />
                <DropdownMenuItem
                  onSelect={() => nav({ to: "/profile" })}
                  className="cursor-pointer focus:bg-card-bg focus:text-foreground"
                >
                  <UserIcon className="h-4 w-4 text-muted-foreground" />
                  <span>My profile</span>
                </DropdownMenuItem>
                <DropdownMenuItem
                  onSelect={() => nav({ to: "/settings" })}
                  className="cursor-pointer focus:bg-card-bg focus:text-foreground"
                >
                  <Settings className="h-4 w-4 text-muted-foreground" />
                  <span>Settings</span>
                </DropdownMenuItem>
                <DropdownMenuSeparator className="bg-line" />
                <DropdownMenuItem
                  onSelect={handleLogout}
                  className="cursor-pointer focus:bg-destructive/10 focus:text-destructive text-destructive"
                >
                  <LogOut className="h-4 w-4" />
                  <span>Sign out</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        <main className="flex-1 p-6 relative z-[2]">{children}</main>
      </div>

      {open && <NotificationDrawer onClose={() => setOpen(false)} onMarkAll={() => markAllRead.mutate()} />}
    </div>
  );
}

function NotificationDrawer({ onClose, onMarkAll }: { onClose: () => void; onMarkAll: () => void }) {
  const notifs = useNotifications().data ?? [];
  return (
    <>
      <div className="fixed inset-0 bg-black/40 z-40" onClick={onClose} />
      <div className="fixed top-0 right-0 bottom-0 w-[360px] bg-off-black border-l border-line z-50 flex flex-col animate-in slide-in-from-right duration-200">
        <div className="h-14 px-5 flex items-center justify-between border-b border-line">
          <h3 className="font-display font-bold">Notifications</h3>
          <button onClick={onMarkAll} className="text-xs text-gold hover:text-gold-hover">
            Mark all read
          </button>
        </div>
        <div className="flex-1 overflow-y-auto">
          {notifs.length === 0 && <div className="p-5 text-sm text-muted-foreground">No notifications yet.</div>}
          {notifs.map((n) => (
            <div
              key={n.id}
              className={`p-4 border-b border-line flex gap-3 ${!n.read ? "bg-gold/10" : ""}`}
            >
              <div
                className={`mt-1 h-2 w-2 rounded-full ${
                  n.type === "ESCALATION"
                    ? "bg-destructive"
                    : n.type === "APPROVAL" || n.type === "CHECKIN_REMINDER"
                    ? "bg-gold pulse-gold"
                    : "bg-foreground"
                }`}
              />
              <div className="flex-1">
                <p className="text-sm">{n.message}</p>
                <p className="text-[11px] text-muted-foreground mt-1 font-mono">{new Date(n.createdAt).toLocaleString()}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
