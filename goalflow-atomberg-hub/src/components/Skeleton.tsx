// Lightweight Tailwind-pulse skeleton primitives. No deps.

import { AlertTriangle, RefreshCw } from "lucide-react";

export function SkeletonBar({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-sm bg-line/60 ${className}`} />;
}

export function SkeletonRow({ cols = 6 }: { cols?: number }) {
  return (
    <tr className="border-t border-line">
      {Array.from({ length: cols }).map((_, i) => (
        <td key={i} className="px-3 py-3">
          <SkeletonBar className="h-3 w-full max-w-[140px]" />
        </td>
      ))}
    </tr>
  );
}

export function SkeletonCard({ lines = 3, className = "" }: { lines?: number; className?: string }) {
  return (
    <div className={`bento p-5 space-y-3 ${className}`}>
      <SkeletonBar className="h-2 w-16" />
      <SkeletonBar className="h-8 w-24" />
      {Array.from({ length: Math.max(0, lines - 2) }).map((_, i) => (
        <SkeletonBar key={i} className="h-2 w-full" />
      ))}
    </div>
  );
}

export function SkeletonTable({ rows = 5, cols = 6 }: { rows?: number; cols?: number }) {
  return (
    <div className="bento overflow-hidden">
      <table className="w-full text-left">
        <thead className="bg-background">
          <tr className="text-[10px] tracking-widest uppercase text-muted-foreground">
            {Array.from({ length: cols }).map((_, i) => (
              <th key={i} className="px-3 py-3 font-medium"><SkeletonBar className="h-2 w-16" /></th>
            ))}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: rows }).map((_, i) => <SkeletonRow key={i} cols={cols} />)}
        </tbody>
      </table>
    </div>
  );
}

export function SkeletonMetricGrid({ items = 4 }: { items?: number }) {
  return (
    <div className={`grid grid-cols-1 md:grid-cols-${items} gap-3`}>
      {Array.from({ length: items }).map((_, i) => <SkeletonCard key={i} />)}
    </div>
  );
}

// Per-route error UI — small, calm, actionable.
export function RouteError({ error, reset }: { error: Error; reset?: () => void }) {
  return (
    <div className="bento p-8 flex items-start gap-4 max-w-2xl">
      <div className="h-10 w-10 bg-destructive/10 border border-destructive/30 flex items-center justify-center text-destructive shrink-0">
        <AlertTriangle className="h-5 w-5" />
      </div>
      <div className="flex-1">
        <h3 className="font-display font-bold">This section couldn't load</h3>
        <p className="text-sm text-muted-foreground mt-1">
          {error.message || "An unexpected error occurred."}
        </p>
        {reset && (
          <button
            onClick={reset}
            className="mt-4 inline-flex items-center gap-2 text-xs border border-gold text-gold px-3 py-1.5 hover:bg-gold/10 transition"
          >
            <RefreshCw className="h-3 w-3" /> Try again
          </button>
        )}
      </div>
    </div>
  );
}
