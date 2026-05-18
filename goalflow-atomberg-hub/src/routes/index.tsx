import { createFileRoute, redirect } from "@tanstack/react-router";
import { useStore } from "@/lib/store";
import { api, getAuthToken } from "@/api/client";
import type { User } from "@/api/types";

export const Route = createFileRoute("/")({
  beforeLoad: async ({ context }) => {
    let user = useStore.getState().currentUser;
    if (!user && getAuthToken()) {
      try {
        const fetched = await context.queryClient.fetchQuery({
          queryKey: ["me"],
          queryFn: () => api<{ user: User | null }>("/auth/me").then((r) => r.user),
          staleTime: 30_000,
        });
        if (fetched) {
          useStore.getState().setCurrentUser(fetched);
          user = fetched;
        }
      } catch {
        // 401 / network — fall through to login redirect
      }
    }
    if (!user) throw redirect({ to: "/login" });
    if (user.role === "EMPLOYEE") throw redirect({ to: "/employee/dashboard" });
    if (user.role === "MANAGER") throw redirect({ to: "/manager/dashboard" });
    throw redirect({ to: "/admin/cycles" });
  },
  component: () => null,
});
