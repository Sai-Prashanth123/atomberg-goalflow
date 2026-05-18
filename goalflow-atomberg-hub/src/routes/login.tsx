import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useStore } from "@/lib/store";
import { useLogin } from "@/api/hooks";
import { supabase } from "@/lib/supabase";
import { Bento, Chip, GoldButton, Input, Metric } from "@/components/ui-kit";
import { Eye, EyeOff, AlertCircle } from "lucide-react";
import logo from "@/assets/atomberg-logo.svg";

export const Route = createFileRoute("/login")({ component: LoginPage });

const ROLES = [
  { label: "Employee", email: "aarav@atomberg.com" },
  { label: "Manager", email: "priya@atomberg.com" },
  { label: "Admin", email: "rohan@atomberg.com" },
];

function LoginPage() {
  const nav = useNavigate();
  const setCurrentUser = useStore((s) => s.setCurrentUser);
  const login = useLogin();

  const [show, setShow] = useState(false);
  const [email, setEmail] = useState("aarav@atomberg.com");
  const [password, setPassword] = useState("password123");
  const [error, setError] = useState<string | null>(null);
  const [ssoBusy, setSsoBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      const res = await login.mutateAsync({ email, password });
      setCurrentUser(res.user);
      routeByRole(res.user.role);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    }
  };

  // BRD §5.1 — Real Microsoft Entra ID SSO via Supabase Auth (Azure provider).
  // Requires Azure AD app registration + Supabase Auth provider config.
  const ssoLogin = async () => {
    setError(null);
    setSsoBusy(true);
    const { error: sErr } = await supabase.auth.signInWithOAuth({
      provider: "azure",
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
        scopes: "openid profile email",
        queryParams: { prompt: "select_account" },
      },
    });
    if (sErr) {
      setSsoBusy(false);
      setError(`Azure provider not configured in Supabase: ${sErr.message}`);
    }
    // On success, the browser is redirected away — no further action here.
  };

  const routeByRole = (role: string) => {
    if (role === "EMPLOYEE") nav({ to: "/employee/dashboard" });
    else if (role === "MANAGER") nav({ to: "/manager/dashboard" });
    else nav({ to: "/admin/cycles" });
  };

  return (
    <div className="min-h-screen flex grain">
      <div className="hidden lg:flex w-[55%] bg-background p-12 flex-col justify-between relative z-[2]">
        <div className="flex items-center gap-3">
          <img src={logo} alt="Atomberg" className="h-8" />
          <span className="text-[11px] tracking-[0.2em] uppercase text-gold font-mono">GoalFlow</span>
        </div>

        <div>
          <h1 className="font-display text-5xl xl:text-6xl font-bold leading-[1.08] tracking-tight">
            Goal Setting.<br />
            Quarterly Tracking.<br />
            <span className="text-gold">Audit-Ready.</span>
          </h1>
          <p className="mt-6 text-muted-foreground max-w-md leading-relaxed">
            Atomberg's in-house portal for the full goal lifecycle — from creation and manager approval through quarterly check-ins to performance reviews.
          </p>

          <div className="mt-10 grid grid-cols-3 gap-3 max-w-xl">
            <Bento className="p-5">
              <div className="label-eyebrow">Goals / Cycle</div>
              <Metric value="8" suffix="max" />
            </Bento>
            <Bento className="p-5">
              <div className="label-eyebrow">Weightage</div>
              <Metric value="100" suffix="%" />
            </Bento>
            <Bento className="p-5">
              <div className="label-eyebrow">Check-ins</div>
              <Metric value="4" suffix="/yr" />
            </Bento>
          </div>
        </div>

        <div className="text-xs text-muted-foreground font-mono">
          © 2026 Atomberg Technologies · Built for AtomQuest Hackathon 1.0
        </div>
      </div>

      <div className="w-full lg:w-[45%] bg-off-black border-l border-line flex items-center justify-center p-8 relative z-[2]">
        <div className="w-full max-w-sm">
          <div className="flex justify-center mb-10">
            <img src={logo} alt="Atomberg" className="h-14" />
          </div>

          <h2 className="font-display text-3xl font-bold mb-1">Welcome back</h2>
          <p className="text-sm text-muted-foreground mb-8">Sign in with your Atomberg credentials.</p>

          <form onSubmit={submit} className="space-y-4">
            <div>
              <label htmlFor="login-email" className="label-eyebrow mb-1.5 block">Email</label>
              <Input
                id="login-email"
                name="email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <div>
              <label htmlFor="login-password" className="label-eyebrow mb-1.5 block">Password</label>
              <div className="relative">
                <Input
                  id="login-password"
                  name="password"
                  type={show ? "text" : "password"}
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
                <button
                  type="button"
                  onClick={() => setShow(!show)}
                  aria-label={show ? "Hide password" : "Show password"}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-gold"
                >
                  {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <div>
              <div className="label-eyebrow mb-2" id="demo-role-label">Demo Role — quick switch</div>
              <div className="grid grid-cols-3 gap-2" role="group" aria-labelledby="demo-role-label">
                {ROLES.map((r) => (
                  <Chip key={r.label} active={email === r.email} onClick={() => { setEmail(r.email); setPassword("password123"); }}>
                    {r.label}
                  </Chip>
                ))}
              </div>
            </div>

            {error && (
              <div className="flex items-center gap-2 text-xs text-destructive">
                <AlertCircle className="h-3.5 w-3.5" /> {error}
              </div>
            )}

            <GoldButton type="submit" className="w-full h-11" disabled={login.isPending}>
              {login.isPending ? "Signing in…" : "Sign In"}
            </GoldButton>

            <div className="flex items-center gap-3 my-1">
              <div className="flex-1 h-px bg-line" />
              <span className="text-[10px] tracking-widest uppercase text-muted-foreground">or continue with</span>
              <div className="flex-1 h-px bg-line" />
            </div>

            <button type="button" onClick={ssoLogin} disabled={ssoBusy} className="w-full border border-foreground/30 text-foreground py-2.5 text-sm flex items-center justify-center gap-2 hover:bg-foreground/5 transition disabled:opacity-50">
              <svg width="14" height="14" viewBox="0 0 23 23"><path fill="#f25022" d="M1 1h10v10H1z"/><path fill="#7fba00" d="M12 1h10v10H12z"/><path fill="#00a4ef" d="M1 12h10v10H1z"/><path fill="#ffb900" d="M12 12h10v10H12z"/></svg>
              {ssoBusy ? "Redirecting…" : "Sign in with Microsoft"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
