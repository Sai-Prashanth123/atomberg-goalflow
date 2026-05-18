import { ReactNode } from "react";

export function Bento({ children, className = "", hover = false, accent = false }: { children: ReactNode; className?: string; hover?: boolean; accent?: boolean }) {
  return (
    <div className={`bento ${hover ? "bento-hover" : ""} ${accent ? "border-l-2 border-l-gold" : ""} ${className}`}>
      {children}
    </div>
  );
}

export function Eyebrow({ children }: { children: ReactNode }) {
  return <div className="label-eyebrow">{children}</div>;
}

export function Metric({ value, suffix }: { value: string | number; suffix?: string }) {
  return (
    <div className="font-mono text-gold text-3xl font-semibold leading-none">
      {value}
      {suffix && <span className="text-base ml-1 text-gold/70">{suffix}</span>}
    </div>
  );
}

export function GoldBar({ value, max = 100, danger = false }: { value: number; max?: number; danger?: boolean }) {
  const pct = Math.min(100, Math.max(0, (value / max) * 100));
  return (
    <div className="h-1 w-full bg-line overflow-hidden">
      <div
        className={`h-full transition-all duration-700 ease-out ${danger ? "bg-destructive" : "bg-gold"}`}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

export function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    "On Track": "border border-gold text-gold",
    "ON_TRACK": "border border-gold text-gold",
    "Completed": "bg-gold text-black",
    "COMPLETED": "bg-gold text-black",
    "Not Started": "border border-muted-foreground/40 text-muted-foreground",
    "NOT_STARTED": "border border-muted-foreground/40 text-muted-foreground",
    "Pending": "border border-gold/60 text-gold",
    "PENDING": "border border-gold/60 text-gold",
    "Approved": "bg-gold text-black",
    "APPROVED": "bg-gold text-black",
    "Returned": "border border-destructive text-destructive",
    "RETURNED": "border border-destructive text-destructive",
    "Draft": "border border-foreground/30 text-foreground",
    "DRAFT": "border border-foreground/30 text-foreground",
    "Active": "bg-gold text-black",
    "ACTIVE": "bg-gold text-black",
    "Upcoming": "border border-gold text-gold",
    "UPCOMING": "border border-gold text-gold",
    "Closed": "border border-muted-foreground/40 text-muted-foreground",
    "CLOSED": "border border-muted-foreground/40 text-muted-foreground",
  };
  const labelMap: Record<string, string> = {
    ON_TRACK: "On Track", NOT_STARTED: "Not Started", COMPLETED: "Completed",
    DRAFT: "Draft", PENDING: "Pending", APPROVED: "Approved", RETURNED: "Returned",
    UPCOMING: "Upcoming", ACTIVE: "Active", CLOSED: "Closed",
  };
  const display = labelMap[status] ?? status;
  return (
    <span className={`inline-block text-[10px] tracking-widest uppercase px-2 py-0.5 ${map[status] ?? "border border-muted-foreground/40 text-muted-foreground"}`}>
      {display}
    </span>
  );
}

export function CircularProgress({ value }: { value: number }) {
  const r = 28;
  const c = 2 * Math.PI * r;
  const dash = (value / 100) * c;
  return (
    <div className="relative h-20 w-20">
      <svg className="h-20 w-20 -rotate-90">
        <circle cx="40" cy="40" r={r} stroke="#BDDBE5" strokeWidth="4" fill="none" />
        <circle
          cx="40" cy="40" r={r}
          stroke="#F2BB44" strokeWidth="4" fill="none"
          strokeDasharray={`${dash} ${c}`}
          strokeLinecap="round"
          className="transition-all duration-700"
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center font-mono text-gold text-sm font-semibold">
        {value}%
      </div>
    </div>
  );
}

export function GoldButton({ children, className = "", ...rest }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...rest}
      className={`bg-gold text-black px-4 py-2.5 font-display font-bold text-sm hover:bg-gold-hover transition-all hover:-translate-y-px active:translate-y-0 disabled:opacity-35 disabled:cursor-not-allowed ${className}`}
    >
      {children}
    </button>
  );
}

export function OutlineButton({ children, className = "", ...rest }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...rest}
      className={`bg-transparent border border-gold text-gold px-4 py-2.5 font-display font-bold text-sm hover:bg-gold/10 transition-all disabled:opacity-35 disabled:cursor-not-allowed ${className}`}
    >
      {children}
    </button>
  );
}

export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={`w-full bg-white border border-line text-foreground placeholder:text-muted-foreground/60 px-3 py-2.5 text-sm focus:outline-none focus:border-gold focus:ring-2 focus:ring-gold/25 transition-all ${props.className ?? ""}`}
    />
  );
}

export function Textarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...props}
      className={`w-full bg-white border border-line text-foreground placeholder:text-muted-foreground/60 px-3 py-2.5 text-sm focus:outline-none focus:border-gold focus:ring-2 focus:ring-gold/25 transition-all ${props.className ?? ""}`}
    />
  );
}

export function Chip({
  active,
  onClick,
  children,
  disabled = false,
}: {
  active?: boolean;
  onClick?: () => void;
  children: ReactNode;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      aria-disabled={disabled || undefined}
      className={`px-3 py-1.5 text-xs font-medium transition-all border ${
        active
          ? "bg-gold text-black border-gold"
          : "bg-white text-muted-foreground border-line hover:text-foreground hover:border-foreground/30"
      } disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:text-muted-foreground disabled:hover:border-line`}
    >
      {children}
    </button>
  );
}
