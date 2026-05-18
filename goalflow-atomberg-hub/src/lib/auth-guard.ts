import { redirect } from "@tanstack/react-router";
import type { QueryClient } from "@tanstack/react-query";
import { api, ApiError, getAuthToken, setAuthToken } from "@/api/client";
import { useStore } from "@/lib/store";
import type { Role, User } from "@/api/types";

const ROLE_HOME: Record<Role, string> = {
  EMPLOYEE: "/employee/dashboard",
  MANAGER: "/manager/dashboard",
  ADMIN: "/admin/cycles",
};

// Shared /auth/me probe. Accepts EITHER an Authorization header (from
// localStorage) OR the HttpOnly cookie. The response includes a fresh token
// which we rehydrate into localStorage so subsequent requests work from
// Authorization header even if Chrome later blocks the cookie.
async function probeAuthMe(queryClient: QueryClient): Promise<User | null> {
  return queryClient.fetchQuery({
    queryKey: ["me"],
    queryFn: async () => {
      const r = await api<{ user: User | null; token?: string }>("/auth/me");
      if (r.token) setAuthToken(r.token);
      return r.user;
    },
    staleTime: 30_000,
  });
}

/**
 * Route guard for authenticated dashboards.
 *
 * The Zustand store is in-memory and empty on every page load — so a naive
 * synchronous check sends every reload to /login before AuthBoot can fetch
 * /auth/me. This helper makes the guard async: if there's a stored token,
 * it waits for /auth/me through the React Query cache (deduped) so beforeLoad
 * has a real answer to decide on.
 *
 * Usage:
 *   beforeLoad: ({ context }) => guardRoute(context, ["EMPLOYEE"]),
 */
export async function guardRoute(
  context: { queryClient: QueryClient },
  allowedRoles: Role[],
): Promise<void> {
  // SSR has no localStorage — we can't see the user's token. Defer the auth check
  // to the client so the stored token gets a chance to authenticate. Without this,
  // every page reload would redirect to /login regardless of session state.
  if (typeof window === "undefined") return;

  let user = useStore.getState().currentUser;

  // Always try /auth/me when we don't have a hydrated user. The cookie is sent
  // automatically and Authorization header is attached if a token exists, so
  // this works whether the user has localStorage state, just a cookie, or both.
  if (!user) {
    try {
      const fetched = await probeAuthMe(context.queryClient);
      if (fetched) {
        useStore.getState().setCurrentUser(fetched);
        user = fetched;
      }
    } catch (err) {
      // Only 401 = "not authenticated, send to login". Everything else
      // (network error, 500, malformed JSON) is a real failure — let it
      // surface so the route's errorComponent can render an error UI.
      if (!(err instanceof ApiError) || err.status !== 401) {
        throw err;
      }
      // Stale token in localStorage — clear so future requests don't keep using it.
      if (getAuthToken()) setAuthToken(null);
    }
  }

  if (!user) throw redirect({ to: "/login" });
  if (!allowedRoles.includes(user.role)) {
    throw redirect({ to: ROLE_HOME[user.role] });
  }
}

/**
 * Guard for routes that just need any authenticated user (Profile, Settings, Analytics).
 */
export async function guardAuthenticated(context: { queryClient: QueryClient }): Promise<void> {
  if (typeof window === "undefined") return;
  let user = useStore.getState().currentUser;

  if (!user) {
    try {
      const fetched = await probeAuthMe(context.queryClient);
      if (fetched) {
        useStore.getState().setCurrentUser(fetched);
        user = fetched;
      }
    } catch (err) {
      if (!(err instanceof ApiError) || err.status !== 401) throw err;
      if (getAuthToken()) setAuthToken(null);
    }
  }

  if (!user) throw redirect({ to: "/login" });
}
