import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useStore } from "@/lib/store";
import { useQoQ, useDistribution, useManagerEffectiveness, useHeatmap, useUsers } from "@/api/hooks";
import { THRUST_LABEL, UOM_LABEL } from "@/api/types";
import { guardAuthenticated } from "@/lib/auth-guard";
import { Bento, Chip, Eyebrow, GoldBar } from "@/components/ui-kit";
import { SkeletonCard, RouteError } from "@/components/Skeleton";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend, BarChart, Bar,
} from "recharts";

export const Route = createFileRoute("/analytics")({
  beforeLoad: ({ context }) => guardAuthenticated(context),
  component: Analytics,
  errorComponent: ({ error, reset }) => <RouteError error={error} reset={reset} />,
});

const GOLD = "#F2BB44";
const MUTED = "#5C6E78";
const GRID = "#C9E2EB";
const TOOLTIP_BG = "#FFFFFF";
const TOOLTIP_BORDER = "#BDDBE5";
const TOOLTIP_TEXT = "#0F1419";

function Analytics() {
  const [department, setDepartment] = useState<string | null>(null);
  const filter = department ? { department } : undefined;

  const users = useUsers().data ?? [];
  const departments = useMemo(() => {
    const set = new Set<string>();
    for (const u of users) if (u.department) set.add(u.department);
    return Array.from(set).sort();
  }, [users]);

  const trendQ = useQoQ(filter);
  const distQ = useDistribution(filter);
  const managersQ = useManagerEffectiveness(filter);
  const heatmapQ = useHeatmap(filter);
  const trend = trendQ.data ?? [];
  const dist = distQ.data;
  const managers = managersQ.data ?? [];
  const heatmap = heatmapQ.data ?? [];

  if (trendQ.isPending || distQ.isPending || managersQ.isPending) {
    return (
      <div className="space-y-4">
        <h1 className="font-display text-3xl font-bold">Analytics</h1>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          <SkeletonCard lines={6} />
          <SkeletonCard lines={6} />
        </div>
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-3">
          <SkeletonCard lines={5} />
          <SkeletonCard lines={5} />
          <SkeletonCard lines={5} />
        </div>
      </div>
    );
  }

  const pieColors = ["#F2BB44", "#E0A830", "#A8862C", "#705820", "#3E3010"];

  const thrustData = dist
    ? Object.entries(dist.thrust).map(([k, v]) => ({ name: THRUST_LABEL[k as keyof typeof THRUST_LABEL] ?? k, value: v }))
    : [];
  const uomData = dist
    ? Object.entries(dist.uom).map(([k, v]) => ({ name: UOM_LABEL[k as keyof typeof UOM_LABEL] ?? k, count: v }))
    : [];

  // BRD §5.4 — analytics must surface "no data" states meaningfully rather
  // than rendering an empty chart that looks like a load failure.
  const noData =
    trend.every((t) => t.n === 0) &&
    thrustData.length === 0 &&
    uomData.length === 0 &&
    managers.length === 0 &&
    heatmap.length === 0;

  if (noData) {
    return (
      <div className="space-y-4">
        <h1 className="font-display text-3xl font-bold">Analytics</h1>
        <Bento className="p-12 text-center">
          <Eyebrow>Insights waiting</Eyebrow>
          <h2 className="font-display text-2xl font-bold mt-2">Nothing to analyse yet</h2>
          <p className="text-sm text-muted-foreground mt-2 max-w-md mx-auto">
            QoQ trends, distribution charts, manager effectiveness and completion heatmaps
            populate once goals are submitted, approved, and quarterly check-ins start to flow in.
          </p>
        </Bento>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h1 className="font-display text-3xl font-bold">Analytics</h1>
      <p className="text-xs text-muted-foreground">All numbers computed from live data via the backend analytics endpoints.</p>

      {departments.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="label-eyebrow">Department</span>
          <button
            type="button"
            onClick={() => setDepartment(null)}
            className={`text-[10px] uppercase tracking-widest px-2 py-1 border transition-colors ${
              department === null
                ? "border-gold text-gold bg-gold/10"
                : "border-line text-muted-foreground hover:text-foreground"
            }`}
          >
            All Departments
          </button>
          {departments.map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => setDepartment(d)}
              className={`text-[10px] uppercase tracking-widest px-2 py-1 border transition-colors ${
                department === d
                  ? "border-gold text-gold bg-gold/10"
                  : "border-line text-muted-foreground hover:text-foreground"
              }`}
            >
              {d}
            </button>
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <Bento className="p-5">
          <Eyebrow>QoQ Achievement Trend</Eyebrow>
          <div className="mt-4 h-64 w-full">
            <ResponsiveContainer width="100%" height="100%" minWidth={0}>
              <LineChart data={trend.map((t) => ({ quarter: t.quarter, score: t.score, n: t.n }))}>
                <CartesianGrid strokeDasharray="2 4" stroke={GRID} />
                <XAxis dataKey="quarter" stroke={MUTED} fontSize={11} />
                <YAxis stroke={MUTED} fontSize={11} />
                <Tooltip contentStyle={{ background: TOOLTIP_BG, border: `1px solid ${TOOLTIP_BORDER}`, color: TOOLTIP_TEXT, fontFamily: "Roboto Mono", fontSize: 11 }} />
                <Line type="monotone" dataKey="score" stroke={GOLD} strokeWidth={2} dot={{ fill: GOLD, r: 4 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Bento>

        <Bento className="p-5">
          <Eyebrow>Goal Distribution by Thrust Area</Eyebrow>
          <div className="mt-4 h-64 w-full">
            <ResponsiveContainer width="100%" height="100%" minWidth={0}>
              <PieChart>
                <Pie data={thrustData} dataKey="value" innerRadius={50} outerRadius={90} paddingAngle={2}>
                  {thrustData.map((_, i) => <Cell key={i} fill={pieColors[i % pieColors.length]} />)}
                </Pie>
                <Tooltip contentStyle={{ background: TOOLTIP_BG, border: `1px solid ${TOOLTIP_BORDER}`, color: TOOLTIP_TEXT }} />
                <Legend wrapperStyle={{ fontSize: 11, color: MUTED }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </Bento>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-3">
        <Bento className="p-5">
          <Eyebrow>Completion Heatmap</Eyebrow>
          <div className="mt-4 space-y-2">
            <div className="grid grid-cols-[1fr_repeat(4,40px)] gap-1 text-[10px] uppercase tracking-widest text-muted-foreground pb-1">
              <div>Employee</div>
              {(["Q1", "Q2", "Q3", "Q4"] as const).map((q) => <div key={q} className="text-center">{q}</div>)}
            </div>
            {heatmap.map((u) => (
              <div key={u.id} className="grid grid-cols-[1fr_repeat(4,40px)] gap-1 items-center">
                <div className="text-xs truncate">{u.name}</div>
                {u.cells.map((c) => (
                  <div
                    key={c.quarter}
                    className="h-7"
                    style={{
                      background: c.pct === 0 ? "transparent" : `rgba(242,187,68,${Math.max(0.08, c.pct / 100)})`,
                      border: c.pct === 0 ? "1px dashed rgba(189,219,229,0.4)" : "none",
                    }}
                    title={`${c.quarter}: ${c.pct}%`}
                  />
                ))}
              </div>
            ))}
          </div>
        </Bento>

        <Bento className="p-5">
          <Eyebrow>UoM Type Breakdown</Eyebrow>
          <div className="mt-4 h-64 w-full">
            <ResponsiveContainer width="100%" height="100%" minWidth={0}>
              <BarChart data={uomData} layout="vertical">
                <CartesianGrid strokeDasharray="2 4" stroke={GRID} />
                <XAxis type="number" stroke={MUTED} fontSize={11} />
                <YAxis type="category" dataKey="name" stroke={MUTED} fontSize={11} width={80} />
                <Tooltip contentStyle={{ background: TOOLTIP_BG, border: `1px solid ${TOOLTIP_BORDER}`, color: TOOLTIP_TEXT }} />
                <Bar dataKey="count" fill={GOLD} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Bento>

        <Bento className="p-5">
          <Eyebrow>Manager Effectiveness</Eyebrow>
          <div className="mt-4 space-y-3">
            {managers.map((m) => (
              <div key={m.id}>
                <div className="flex items-center justify-between text-xs mb-1.5">
                  <span>{m.name} <span className="text-muted-foreground">· {m.teamSize}</span></span>
                  <span className="font-mono text-gold">{m.score}%</span>
                </div>
                <GoldBar value={m.score} />
              </div>
            ))}
            {managers.length === 0 && <p className="text-xs text-muted-foreground">No managers with reports yet.</p>}
          </div>
        </Bento>
      </div>
    </div>
  );
}
