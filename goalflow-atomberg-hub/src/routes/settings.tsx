import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useStore } from "@/lib/store";
import { useLogout } from "@/api/hooks";
import { guardAuthenticated } from "@/lib/auth-guard";
import { Bento, Eyebrow, GoldBar, OutlineButton } from "@/components/ui-kit";
import { RouteError } from "@/components/Skeleton";
import { Bell, Mail, MessageSquare, Palette, Info, LogOut, Shield, ExternalLink, type LucideIcon } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/settings")({
  beforeLoad: ({ context }) => guardAuthenticated(context),
  component: SettingsPage,
  errorComponent: ({ error, reset }) => <RouteError error={error} reset={reset} />,
});

type Prefs = {
  emailOnApproval: boolean;
  emailOnReturn: boolean;
  emailOnCheckin: boolean;
  emailOnEscalation: boolean;
  desktopNotifications: boolean;
};

const DEFAULT_PREFS: Prefs = {
  emailOnApproval: true,
  emailOnReturn: true,
  emailOnCheckin: true,
  emailOnEscalation: true,
  desktopNotifications: false,
};

const STORAGE_KEY = "goalflow.notification.prefs";

function loadPrefs(): Prefs {
  if (typeof window === "undefined") return DEFAULT_PREFS;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_PREFS;
    return { ...DEFAULT_PREFS, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_PREFS;
  }
}

function SettingsPage() {
  const user = useStore((s) => s.currentUser!);
  const setCurrentUser = useStore((s) => s.setCurrentUser);
  const logout = useLogout();
  const nav = useNavigate();

  const [prefs, setPrefs] = useState<Prefs>(DEFAULT_PREFS);

  useEffect(() => {
    setPrefs(loadPrefs());
  }, []);

  const update = <K extends keyof Prefs>(key: K, value: Prefs[K]) => {
    const next = { ...prefs, [key]: value };
    setPrefs(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      toast.success("Preference saved");
    } catch {
      toast.error("Could not save preference locally");
    }
  };

  const handleSignOut = async () => {
    await logout.mutateAsync().catch(() => null);
    setCurrentUser(null);
    nav({ to: "/login" });
  };

  return (
    <div className="max-w-3xl">
        <Eyebrow>Account</Eyebrow>
        <h1 className="font-display text-3xl font-bold mt-1 mb-2">Settings</h1>
        <p className="text-sm text-muted-foreground mb-6">Manage your account preferences and notifications.</p>
        <GoldBar value={100} />

        <div className="mt-8 space-y-4">
          <Bento className="p-6">
            <div className="flex items-center gap-3 mb-1">
              <Bell className="h-4 w-4 text-gold" />
              <h2 className="font-display text-lg font-bold">Notification preferences</h2>
            </div>
            <p className="text-xs text-muted-foreground mb-5">Choose which events trigger an email to <span className="font-mono text-foreground">{user.email}</span>. Saved locally per browser.</p>

            <div className="divide-y divide-line border-y border-line">
              <Toggle
                icon={Mail}
                label="Goal approved"
                description="An email when your manager approves a submitted goal"
                checked={prefs.emailOnApproval}
                onChange={(v) => update("emailOnApproval", v)}
              />
              <Toggle
                icon={Mail}
                label="Goal returned"
                description="An email when your manager returns a goal for rework"
                checked={prefs.emailOnReturn}
                onChange={(v) => update("emailOnReturn", v)}
              />
              <Toggle
                icon={Mail}
                label="Check-in reminder"
                description="An email when a quarterly check-in window opens"
                checked={prefs.emailOnCheckin}
                onChange={(v) => update("emailOnCheckin", v)}
              />
              <Toggle
                icon={Mail}
                label="Escalations"
                description="An email when an escalation rule fires on your goals or team"
                checked={prefs.emailOnEscalation}
                onChange={(v) => update("emailOnEscalation", v)}
              />
              <Toggle
                icon={MessageSquare}
                label="Desktop browser notifications"
                description="Show toasts in this browser tab when new in-app alerts arrive"
                checked={prefs.desktopNotifications}
                onChange={(v) => update("desktopNotifications", v)}
              />
            </div>
          </Bento>

          <Bento className="p-6">
            <div className="flex items-center gap-3 mb-1">
              <Palette className="h-4 w-4 text-gold" />
              <h2 className="font-display text-lg font-bold">Appearance</h2>
            </div>
            <p className="text-xs text-muted-foreground mb-4">GoalFlow uses Atomberg's light theme with gold accents — designed for daytime office use on a wide range of displays.</p>
            <div className="flex items-center gap-3 p-3 border border-line bg-card-bg">
              <div className="h-10 w-10 bg-gold flex items-center justify-center text-black font-display font-bold">A</div>
              <div className="flex-1">
                <div className="text-sm font-medium">Atomberg Light · Gold accent</div>
                <div className="text-[11px] text-muted-foreground font-mono">#D1EDF6 surface · #F2BB44 accent · Space Grotesk + Roboto</div>
              </div>
              <span className="text-[10px] px-2 py-0.5 border border-foreground/30 text-muted-foreground">Default</span>
            </div>
          </Bento>

          <Bento className="p-6">
            <div className="flex items-center gap-3 mb-1">
              <Shield className="h-4 w-4 text-gold" />
              <h2 className="font-display text-lg font-bold">Security & sign-in</h2>
            </div>
            <p className="text-xs text-muted-foreground mb-4">Atomberg credentials are managed in Microsoft Entra ID. Password resets and account changes happen through your IT helpdesk.</p>
            <div className="flex flex-wrap gap-3">
              <OutlineButton onClick={handleSignOut} className="inline-flex items-center gap-2">
                <LogOut className="h-4 w-4" /> Sign out of this device
              </OutlineButton>
              <a
                href="https://myaccount.microsoft.com"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-4 py-2 text-sm border border-line hover:border-gold/50 hover:bg-card-bg transition-colors"
              >
                Manage Microsoft account <ExternalLink className="h-3.5 w-3.5" />
              </a>
            </div>
          </Bento>

          <Bento className="p-6">
            <div className="flex items-center gap-3 mb-1">
              <Info className="h-4 w-4 text-gold" />
              <h2 className="font-display text-lg font-bold">About</h2>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
              <AboutField label="Product" value="GoalFlow" />
              <AboutField label="Built by" value="Atomberg Technologies" />
              <AboutField label="For" value="AtomQuest Hackathon 1.0" />
              <AboutField label="Stack" value="React 19 · Fastify · Supabase" />
              <AboutField label="Auth" value="Microsoft Entra ID (SSO)" />
              <AboutField label="Version" value="0.1.0" mono />
            </div>
          </Bento>
        </div>
      </div>
  );
}

function Toggle({
  icon: Icon,
  label,
  description,
  checked,
  onChange,
}: {
  icon: LucideIcon;
  label: string;
  description: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center gap-4 py-4">
      <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium">{label}</div>
        <div className="text-xs text-muted-foreground">{description}</div>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors outline-none focus-visible:ring-2 focus-visible:ring-gold ${
          checked ? "bg-gold" : "bg-foreground/15"
        }`}
      >
        <span
          className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${
            checked ? "translate-x-5" : "translate-x-1"
          }`}
        />
      </button>
    </div>
  );
}

function AboutField({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <div className="label-eyebrow">{label}</div>
      <div className={`text-sm ${mono ? "font-mono" : ""}`}>{value}</div>
    </div>
  );
}
