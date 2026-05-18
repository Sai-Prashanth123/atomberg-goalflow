import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  useRouterState,
  HeadContent,
  Scripts,
  useNavigate,
} from "@tanstack/react-router";
import { useEffect } from "react";

import appCss from "../styles.css?url";
import { api, setAuthToken } from "../api/client";
import type { User } from "../api/types";
import { useStore } from "../lib/store";
import { AppShell } from "../components/AppShell";
import { Toaster } from "../components/ui/sonner";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          This page didn't load
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Something went wrong on our end. You can try refreshing or head back home.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Try again
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Go home
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "GoalFlow — Atomberg" },
      { name: "description", content: "Atomberg's in-house portal for goal setting, quarterly tracking, and audit-ready performance reviews." },
      { name: "author", content: "Atomberg Technologies" },
      { property: "og:title", content: "GoalFlow — Atomberg Goal Setting & Tracking Portal" },
      { property: "og:description", content: "Atomberg's in-house portal for goal setting, quarterly tracking, and audit-ready performance reviews." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "twitter:site", content: "@atomberg" },
      { name: "twitter:title", content: "GoalFlow — Atomberg Goal Setting & Tracking Portal" },
      { name: "twitter:description", content: "Atomberg's in-house portal for goal setting, quarterly tracking, and audit-ready performance reviews." },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "icon", type: "image/svg+xml", href: "/favicon.svg" },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();

  return (
    <QueryClientProvider client={queryClient}>
      <AuthBoot />
      <PageTitleSync />
      <AppShell>
        <Outlet />
      </AppShell>
      <Toaster richColors closeButton position="top-right" />
    </QueryClientProvider>
  );
}

// Updates the browser tab title per route. Mirrors the sidebar nav labels.
const ROUTE_TITLES: Array<{ match: (path: string) => boolean; title: string }> = [
  { match: (p) => p === "/login", title: "Sign in" },
  { match: (p) => p.startsWith("/auth/callback"), title: "Signing in…" },
  { match: (p) => p === "/employee/dashboard", title: "Dashboard" },
  { match: (p) => p === "/employee/goals", title: "My Goals" },
  { match: (p) => p === "/employee/check-in", title: "Quarterly Check-in" },
  { match: (p) => p === "/manager/dashboard", title: "Team Dashboard" },
  { match: (p) => p.startsWith("/manager/team/"), title: "Team Member" },
  { match: (p) => p === "/admin/cycles", title: "Cycles" },
  { match: (p) => p === "/admin/hierarchy", title: "Org Hierarchy" },
  { match: (p) => p === "/admin/audit", title: "Audit Log" },
  { match: (p) => p === "/admin/reports", title: "Reports" },
  { match: (p) => p === "/admin/escalations", title: "Escalations" },
  { match: (p) => p === "/admin/shared-goals", title: "Shared Goals" },
  { match: (p) => p === "/analytics", title: "Analytics" },
  { match: (p) => p === "/profile", title: "My Profile" },
  { match: (p) => p === "/settings", title: "Settings" },
];

function PageTitleSync() {
  const path = useRouterState({ select: (r) => r.location.pathname });
  useEffect(() => {
    if (typeof document === "undefined") return;
    const entry = ROUTE_TITLES.find((r) => r.match(path));
    const section = entry?.title ?? "GoalFlow";
    document.title = entry ? `${section} · GoalFlow` : "GoalFlow — Atomberg";
  }, [path]);
  return null;
}

// Hydrates currentUser from /auth/me on boot and listens for 401 events
// from api/client.ts to redirect to login.
function AuthBoot() {
  const setCurrentUser = useStore((s) => s.setCurrentUser);
  const navigate = useNavigate();

  const { data } = useQuery({
    queryKey: ["me"],
    queryFn: () =>
      api<{ user: User | null; token?: string }>("/auth/me")
        .then((r) => {
          // Rehydrate localStorage from the fresh token /auth/me returns.
          // This recovers sessions where the cookie was the only auth (e.g.
          // first reload after a server restart cleared in-memory state).
          if (r.token) setAuthToken(r.token);
          return r.user;
        })
        .catch(() => null),
    retry: false,
    staleTime: 30_000,
  });

  useEffect(() => {
    setCurrentUser(data ?? null);
  }, [data, setCurrentUser]);

  useEffect(() => {
    const handler = () => {
      setAuthToken(null);
      setCurrentUser(null);
      if (typeof window !== "undefined" && !window.location.pathname.startsWith("/login")) {
        navigate({ to: "/login" });
      }
    };
    window.addEventListener("auth:unauthorized", handler);
    return () => window.removeEventListener("auth:unauthorized", handler);
  }, [navigate, setCurrentUser]);

  return null;
}
