import { createFileRoute, Link } from "@tanstack/react-router";
import { useStore, overallScore } from "@/lib/store";
import { useGoals, useUsers, downloadAchievementCsv, downloadAchievementXlsx, useCompletionReport } from "@/api/hooks";
import { guardRoute } from "@/lib/auth-guard";
import { Bento, Eyebrow, GoldBar, OutlineButton, StatusBadge } from "@/components/ui-kit";
import { SkeletonTable, RouteError } from "@/components/Skeleton";
import { ArrowRight } from "lucide-react";

export const Route = createFileRoute("/admin/reports")({
  beforeLoad: ({ context }) => guardRoute(context, ["ADMIN", "MANAGER"]),
  component: Reports,
  errorComponent: ({ error, reset }) => <RouteError error={error} reset={reset} />,
});

function Reports() {
  const usersQ = useUsers();
  const goalsQ = useGoals();
  const users = (usersQ.data ?? []).filter((u) => u.role === "EMPLOYEE");
  const goals = goalsQ.data ?? [];
  const completion = useCompletionReport().data ?? [];

  if (usersQ.isPending || goalsQ.isPending) {
    return (
      <div className="space-y-4">
        <h1 className="font-display text-3xl font-bold">Reports</h1>
        <SkeletonTable rows={5} cols={6} />
      </div>
    );
  }

  const departments = Array.from(new Set(users.map((u) => u.department))).map((d) => {
    const list = users.filter((u) => u.department === d);
    const avg = list.length
      ? Math.round(list.reduce((s, u) => s + overallScore(goals.filter((g) => g.ownerId === u.id), "Q2"), 0) / list.length)
      : 0;
    return { name: d, value: avg };
  });

  return (
    <div className="space-y-4">
      <h1 className="font-display text-3xl font-bold">Reports</h1>

      <Bento className="overflow-hidden">
        <div className="p-4 border-b border-line flex items-center justify-between">
          <h2 className="font-display font-bold">Achievement Report</h2>
          <div className="flex gap-2">
            <OutlineButton className="text-xs" onClick={() => downloadAchievementCsv()}>Export CSV</OutlineButton>
            <OutlineButton className="text-xs" onClick={() => downloadAchievementXlsx()}>Export Excel</OutlineButton>
          </div>
        </div>
        <table className="w-full text-left text-sm">
          <thead className="bg-background">
            <tr className="text-[10px] tracking-widest uppercase text-muted-foreground">
              <th className="px-4 py-3 font-medium">Employee</th>
              <th className="px-4 py-3 font-medium">Dept</th>
              <th className="px-4 py-3 font-medium">Goals</th>
              <th className="px-4 py-3 font-medium">Approved</th>
              <th className="px-4 py-3 font-medium">Weighted Score</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium text-right">Appraisal</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u, i) => {
              const ug = goals.filter((g) => g.ownerId === u.id);
              const score = overallScore(ug, "Q2");
              const approved = ug.filter((g) => g.approvalStatus === "APPROVED").length;
              return (
                <tr key={u.id} className={i % 2 ? "bg-off-black" : "bg-card-bg"}>
                  <td className="px-4 py-3">{u.name}</td>
                  <td className="px-4 py-3 text-muted-foreground">{u.department}</td>
                  <td className="px-4 py-3 font-mono text-gold">{ug.length}</td>
                  <td className="px-4 py-3 font-mono text-gold">{approved}/{ug.length}</td>
                  <td className="px-4 py-3 font-mono text-gold">{score}%</td>
                  <td className="px-4 py-3"><StatusBadge status={score >= 80 ? "ON_TRACK" : "PENDING"} /></td>
                  <td className="px-4 py-3 text-right">
                    <Link
                      to="/admin/scorecard/$employeeId"
                      params={{ employeeId: u.id }}
                      className="inline-flex items-center gap-1 text-xs text-gold hover:text-gold-hover"
                    >
                      Scorecard <ArrowRight className="h-3 w-3" />
                    </Link>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Bento>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <Bento className="p-5">
          <Eyebrow>Department Completion</Eyebrow>
          <div className="mt-4 space-y-3">
            {departments.map((d) => (
              <div key={d.name}>
                <div className="flex items-center justify-between text-xs mb-1.5">
                  <span>{d.name}</span>
                  <span className="font-mono text-gold">{d.value}%</span>
                </div>
                <GoldBar value={d.value} />
              </div>
            ))}
          </div>
        </Bento>

        <Bento className="p-5">
          <Eyebrow>Check-in Compliance Heatmap</Eyebrow>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  <th className="text-left text-xs text-muted-foreground py-2 pr-3">Employee</th>
                  {(["Q1", "Q2", "Q3", "Q4"] as const).map((q) => <th key={q} className="text-[10px] tracking-widest uppercase text-muted-foreground py-2 px-2">{q}</th>)}
                </tr>
              </thead>
              <tbody>
                {completion.map((u) => (
                  <tr key={u.user.id} className="border-t border-line">
                    <td className="text-xs py-2 pr-3">{u.user.name}</td>
                    {u.quarters.map((c) => (
                      <td key={c.quarter} className="py-2 px-1">
                        <div className="h-8 w-full flex items-center justify-center text-[10px] font-mono text-black font-bold" style={{ background: `rgba(242,187,68,${Math.max(0.08, c.pct / 100)})` }}>
                          {c.pct ? `${c.pct}%` : "—"}
                        </div>
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Bento>
      </div>
    </div>
  );
}
