import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useStore } from "@/lib/store";
import { supabase } from "@/lib/supabase";
import { api, setAuthToken } from "@/api/client";
import type { User } from "@/api/types";
import { AlertCircle } from "lucide-react";

export const Route = createFileRoute("/auth/callback")({ component: AuthCallback });

function AuthCallback() {
  const nav = useNavigate();
  const setCurrentUser = useStore((s) => s.setCurrentUser);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      // Supabase has already parsed the URL fragment / code by now (detectSessionInUrl: true)
      // — but to be safe we wait for the session to materialize.
      const { data: { session }, error: sErr } = await supabase.auth.getSession();
      if (sErr || !session) {
        setError(sErr?.message ?? "No Supabase session — sign-in may have been cancelled.");
        return;
      }

      try {
        const res = await api<{ user: User; token: string; via: string }>("/auth/sso/microsoft", {
          method: "POST",
          // BRD §5.1 — forward the delegated Azure access token so the backend
          // can call Microsoft Graph for org hierarchy + group membership sync.
          body: JSON.stringify({
            accessToken: session.access_token,
            providerToken: session.provider_token ?? undefined,
          }),
        });
        if (cancelled) return;
        setAuthToken(res.token);
        setCurrentUser(res.user);
        const role = res.user.role;
        if (role === "EMPLOYEE") nav({ to: "/employee/dashboard" });
        else if (role === "MANAGER") nav({ to: "/manager/dashboard" });
        else nav({ to: "/admin/cycles" });
      } catch (err) {
        setError(err instanceof Error ? err.message : "Token exchange failed");
      }
    })();

    return () => { cancelled = true; };
  }, [nav, setCurrentUser]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-6">
      <div className="bento p-8 max-w-md w-full">
        {error ? (
          <>
            <div className="flex items-center gap-2 text-destructive">
              <AlertCircle className="h-4 w-4" />
              <h2 className="font-display font-bold">Sign-in failed</h2>
            </div>
            <p className="text-sm text-muted-foreground mt-2">{error}</p>
            <button onClick={() => nav({ to: "/login" })} className="mt-6 text-xs border border-gold text-gold px-4 py-2 hover:bg-gold/10 transition">
              Back to login
            </button>
          </>
        ) : (
          <>
            <h2 className="font-display font-bold">Completing sign-in…</h2>
            <p className="text-sm text-muted-foreground mt-2">Exchanging Microsoft session for a GoalFlow token.</p>
            <div className="mt-4 h-1 bg-line overflow-hidden">
              <div className="h-full bg-gold animate-pulse" style={{ width: "60%" }} />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
