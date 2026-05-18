import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useStore } from "@/lib/store";
import { useGoals } from "@/api/hooks";
import { guardRoute } from "@/lib/auth-guard";
import { Bento, GoldButton, OutlineButton } from "@/components/ui-kit";
import { GoalModal, GoalRow } from "@/components/goal-bits";
import { Plus, Target } from "lucide-react";

export const Route = createFileRoute("/employee/goals")({
  beforeLoad: ({ context }) => guardRoute(context, ["EMPLOYEE"]),
  component: GoalsPage,
});

function GoalsPage() {
  const me = useStore((s) => s.currentUser);
  const goalsQ = useGoals({ mine: true });
  const goals = goalsQ.data ?? [];
  const [modal, setModal] = useState(false);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-3xl font-bold">My Goals</h1>
        <OutlineButton onClick={() => setModal(true)} className="flex items-center gap-2"><Plus className="h-4 w-4" /> New Goal</OutlineButton>
      </div>
      {goals.length === 0 ? (
        <Bento className="p-12 text-center">
          <Target className="h-10 w-10 text-gold mx-auto mb-3 opacity-70" />
          <h3 className="font-display font-bold mb-1">No goals yet — let's set the year</h3>
          <p className="text-sm text-muted-foreground max-w-md mx-auto mb-5">
            Each Atomberg employee defines up to 8 goals across our five Thrust Areas.
            Pick a Thrust Area and you'll see the company KPI it ladders up to.
          </p>
          <GoldButton onClick={() => setModal(true)} className="inline-flex items-center gap-2">
            <Plus className="h-4 w-4" /> Create your first goal
          </GoldButton>
        </Bento>
      ) : (
        <Bento className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left min-w-[860px]">
              <thead className="bg-background">
                <tr className="text-[10px] tracking-widest uppercase text-muted-foreground">
                  {["Thrust Area", "Goal Title", "UoM", "Target", "Q1", "Q2", "Q3", "Q4", "Weight", "Status"].map((h) => (
                    <th key={h} className="px-3 py-3 font-medium">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {goals.map((g, i) => <GoalRow key={g.id} g={g} idx={i} me={me} />)}
              </tbody>
            </table>
          </div>
        </Bento>
      )}
      <GoalModal open={modal} onClose={() => setModal(false)} />
    </div>
  );
}
