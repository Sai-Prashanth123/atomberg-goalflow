import { createFileRoute, Link } from "@tanstack/react-router";
import { useStore, computeScore, overallScore } from "@/lib/store";
import { useUser, useGoals, useUsers, useAuditLog } from "@/api/hooks";
import { guardRoute } from "@/lib/auth-guard";
import { THRUST_LABEL, UOM_LABEL } from "@/api/types";
import type { Quarter } from "@/api/types";
import { THRUST_CONTEXT } from "@/api/thrust-context";
import { splitNote } from "@/lib/note-format";
import { RouteError } from "@/components/Skeleton";
import { Printer, ArrowLeft } from "lucide-react";
import { format } from "date-fns";

export const Route = createFileRoute("/admin/scorecard/$employeeId")({
  beforeLoad: ({ context }) => guardRoute(context, ["ADMIN", "MANAGER"]),
  component: ScorecardPage,
  errorComponent: ({ error, reset }) => <RouteError error={error} reset={reset} />,
});

// BRD §1 pain point D — HR's appraisal-time data assembly problem.
// One printable page per employee combining: goals, quarterly actuals,
// manager comments, audit highlights, and the weighted final score.
// User prints to PDF via the browser dialog — no extra dependencies.
function ScorecardPage() {
  const { employeeId } = Route.useParams();
  const me = useStore((s) => s.currentUser!);
  const userQ = useUser(employeeId);
  const goalsQ = useGoals({ ownerId: employeeId });
  const usersQ = useUsers();
  const auditQ = useAuditLog({ user: userQ.data?.name });

  if (userQ.isPending || goalsQ.isPending) {
    return <div className="p-8 text-sm text-muted-foreground">Loading scorecard…</div>;
  }
  const employee = userQ.data;
  if (!employee) return <div className="p-8 text-sm text-destructive">Employee not found.</div>;

  const goals = goalsQ.data ?? [];
  const allUsers = usersQ.data ?? [];
  const manager = employee.managerId ? allUsers.find((u) => u.id === employee.managerId) : null;
  const audit = auditQ.data ?? [];
  // Audit highlights: post-lock changes only — these are the ones HR cares about at appraisal.
  const auditHighlights = audit.filter((a) => a.postLock).slice(0, 8);

  const quarters: Quarter[] = ["Q1", "Q2", "Q3", "Q4"];
  const finalScore = overallScore(goals, "Q4");
  const fy = new Date().getFullYear();

  const backHref = me.role === "ADMIN" ? "/admin/reports" : "/manager/dashboard";

  return (
    <div className="scorecard-root">
      {/* Print-only stylesheet so the browser-saved PDF is clean (no sidebar/header). */}
      <style>{`
        @media print {
          body { background: white !important; }
          .dashboard-shell aside,
          .dashboard-shell header,
          .scorecard-actions { display: none !important; }
          .scorecard-root { padding: 0 !important; }
          .scorecard-page {
            box-shadow: none !important;
            border: none !important;
            page-break-inside: avoid;
          }
          .scorecard-goal-row { page-break-inside: avoid; }
        }
        .scorecard-page { color-scheme: light; }
      `}</style>

      <div className="scorecard-actions max-w-4xl mx-auto px-2 mb-4 flex items-center justify-between">
        <Link to={backHref} className="text-xs text-muted-foreground hover:text-gold inline-flex items-center gap-1">
          <ArrowLeft className="h-3 w-3" /> Back
        </Link>
        <button
          type="button"
          onClick={() => window.print()}
          className="inline-flex items-center gap-2 text-sm px-4 py-2 bg-gold text-black font-display font-bold hover:bg-gold-hover transition"
        >
          <Printer className="h-4 w-4" /> Print / Save as PDF
        </button>
      </div>

      <div className="scorecard-page bg-white border border-line shadow-sm max-w-4xl mx-auto p-10 print:p-6 text-foreground">
        {/* HEADER */}
        <header className="border-b-2 border-gold pb-4">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <div className="text-[11px] tracking-[0.2em] uppercase text-gold font-mono">Atomberg · GoalFlow</div>
              <h1 className="font-display text-2xl font-bold mt-1">Performance Scorecard FY{fy}</h1>
            </div>
            <div className="text-right text-[11px] text-muted-foreground font-mono">
              Generated {format(new Date(), "dd MMM yyyy · HH:mm")}
              <br />By {me.name} ({me.role})
            </div>
          </div>
        </header>

        {/* EMPLOYEE BLOCK */}
        <section className="mt-6 grid grid-cols-2 gap-x-8 gap-y-2 text-sm">
          <div>
            <div className="label-eyebrow">Employee</div>
            <div className="font-display font-bold text-lg">{employee.name}</div>
            <div className="text-xs text-muted-foreground">{employee.email}</div>
          </div>
          <div>
            <div className="label-eyebrow">Reporting line</div>
            <div className="text-sm">Manager: {manager?.name ?? "—"}</div>
            <div className="text-xs text-muted-foreground">Department: {employee.department}</div>
          </div>
          <div>
            <div className="label-eyebrow">Role</div>
            <div className="text-sm">{titleCase(employee.role)}</div>
          </div>
          <div>
            <div className="label-eyebrow">Weighted Final Score</div>
            <div className={`font-mono font-bold text-3xl ${finalScore >= 80 ? "text-gold" : finalScore >= 60 ? "text-foreground" : "text-destructive"}`}>
              {finalScore}%
            </div>
          </div>
        </section>

        {/* GOALS BLOCK */}
        <section className="mt-8">
          <h2 className="font-display font-bold text-lg mb-1">Goals · Planned vs Actual</h2>
          <p className="text-[11px] text-muted-foreground mb-3">
            Scoring formulas per BRD §2.2 — Min (Actual÷Target), Max (Target÷Actual), Timeline (deadline-based), Zero (0 → 100%, else 0%).
          </p>
          {goals.length === 0 && <div className="text-sm text-muted-foreground italic">No goals on file.</div>}
          {goals.map((g, idx) => {
            const ctx = THRUST_CONTEXT[g.thrustArea];
            return (
              <div key={g.id} className="scorecard-goal-row border-b border-line py-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="text-[10px] tracking-widest uppercase text-muted-foreground">
                      #{idx + 1} · {THRUST_LABEL[g.thrustArea]} · contributes to: <span className="text-gold">{ctx.companyKpi}</span>
                    </div>
                    <div className="font-display font-bold mt-0.5">{g.title}</div>
                    {g.description && (
                      <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{g.description}</p>
                    )}
                  </div>
                  <div className="text-right text-xs shrink-0">
                    <div className="text-muted-foreground">Weight</div>
                    <div className="font-mono text-gold font-bold text-lg">{g.weightage}%</div>
                  </div>
                </div>

                <table className="w-full mt-3 text-xs border border-line">
                  <thead className="bg-card-bg">
                    <tr className="text-[10px] tracking-widest uppercase text-muted-foreground">
                      <th className="px-2 py-1.5 text-left font-medium">UoM</th>
                      <th className="px-2 py-1.5 text-left font-medium">Target</th>
                      {quarters.map((q) => (
                        <th key={q} className="px-2 py-1.5 text-left font-medium">{q}</th>
                      ))}
                      <th className="px-2 py-1.5 text-left font-medium">Status (Q4)</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td className="px-2 py-1.5">{UOM_LABEL[g.uom]}{(g.uom === "NUMERIC" || g.uom === "PERCENTAGE") && g.direction === "MAX" ? " ↓" : ""}</td>
                      <td className="px-2 py-1.5 font-mono text-gold">{g.target}</td>
                      {quarters.map((q) => {
                        const upd = g.quarters.find((x) => x.quarter === q);
                        const score = computeScore(g, { actual: upd?.actual ?? null });
                        return (
                          <td key={q} className="px-2 py-1.5 font-mono">
                            <div>{upd?.actual ?? "—"}</div>
                            <div className={`text-[10px] ${score.ok ? "text-gold" : "text-muted-foreground"}`}>{score.display}</div>
                          </td>
                        );
                      })}
                      <td className="px-2 py-1.5 text-xs">{titleCase(g.quarters.find((x) => x.quarter === "Q4")?.status ?? "NOT_STARTED")}</td>
                    </tr>
                  </tbody>
                </table>

                {/* Manager + employee check-in notes per quarter — split out so HR sees the
                    full narrative at appraisal time. Manager comments come from the
                    [Manager]-prefixed portion of QuarterUpdate.note; employee context is
                    whatever follows the delimiter. */}
                {quarters.some((q) => {
                  const parts = splitNote(g.quarters.find((x) => x.quarter === q)?.note);
                  return parts.manager || parts.employee;
                }) && (
                  <div className="mt-3 text-xs">
                    <div className="label-eyebrow mb-2">Check-in notes</div>
                    <ul className="space-y-2 pl-3 border-l-2 border-gold/40">
                      {quarters.map((q) => {
                        const parts = splitNote(g.quarters.find((x) => x.quarter === q)?.note);
                        if (!parts.manager && !parts.employee) return null;
                        return (
                          <li key={q} className="leading-relaxed">
                            <span className="font-mono text-gold mr-2">{q}</span>
                            {parts.manager && (
                              <span className="block ml-7">
                                <span className="text-[10px] tracking-widest uppercase text-gold mr-1">Manager:</span>
                                <span className="text-foreground">{parts.manager}</span>
                              </span>
                            )}
                            {parts.employee && (
                              <span className="block ml-7">
                                <span className="text-[10px] tracking-widest uppercase text-muted-foreground mr-1">Employee:</span>
                                <span className="text-muted-foreground">{parts.employee}</span>
                              </span>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                )}
              </div>
            );
          })}
        </section>

        {/* AUDIT BLOCK */}
        {auditHighlights.length > 0 && (
          <section className="mt-8">
            <h2 className="font-display font-bold text-lg">Audit Highlights · post-lock changes</h2>
            <p className="text-[11px] text-muted-foreground mb-3">
              All changes made after goals were locked (BRD §4 governance).
            </p>
            <ul className="text-xs space-y-1.5">
              {auditHighlights.map((a) => (
                <li key={a.id} className="flex gap-2">
                  <span className="font-mono text-gold shrink-0">{format(new Date(a.timestamp), "dd MMM HH:mm")}</span>
                  <span className="text-muted-foreground">
                    <span className="text-foreground font-medium">{a.userName}</span> · {a.action}
                    {a.entityLabel ? ` — ${a.entityLabel}` : ""}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* SIGN-OFF */}
        <footer className="mt-12 pt-6 border-t border-line grid grid-cols-2 gap-8 text-xs">
          <div>
            <div className="h-8 border-b border-foreground/40" />
            <div className="mt-1 text-muted-foreground">{employee.name} (employee) · Date</div>
          </div>
          <div>
            <div className="h-8 border-b border-foreground/40" />
            <div className="mt-1 text-muted-foreground">{manager?.name ?? "Manager"} · Date</div>
          </div>
        </footer>
      </div>
    </div>
  );
}

function titleCase(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase().replace(/_/g, " ");
}
