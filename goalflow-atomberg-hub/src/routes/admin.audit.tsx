import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useStore } from "@/lib/store";
import { useAuditLog, downloadAuditCsv } from "@/api/hooks";
import { guardRoute } from "@/lib/auth-guard";
import { Bento, Input, OutlineButton, Chip } from "@/components/ui-kit";
import { SkeletonTable, RouteError } from "@/components/Skeleton";
import { format } from "date-fns";
import { FileText } from "lucide-react";

export const Route = createFileRoute("/admin/audit")({
  beforeLoad: ({ context }) => guardRoute(context, ["ADMIN"]),
  component: AuditLog,
  errorComponent: ({ error, reset }) => <RouteError error={error} reset={reset} />,
});

function AuditLog() {
  const [user, setUser] = useState("");
  const [postLockOnly, setPostLockOnly] = useState(false);
  const auditQ = useAuditLog({ user, postLock: postLockOnly });
  const entries = auditQ.data ?? [];

  const colorMap: Record<string, string> = {
    "Approved Goal": "border-gold text-gold",
    "Returned Goal": "border-destructive text-destructive",
    "Pushed Shared Goal": "border-foreground/40 text-foreground",
    "Updated Achievement": "border-gold/50 text-gold/80",
    "Cycle Opened": "border-foreground/40 text-foreground",
    "Unlocked Goal": "border-gold text-gold",
    "Added Check-in Note": "border-muted-foreground/40 text-muted-foreground",
    "Created Goal": "border-foreground/30 text-foreground",
    "Submitted Goals": "border-gold/60 text-gold",
    "Escalation Raised": "border-destructive text-destructive",
    "Edited Locked Goal": "border-destructive text-destructive",
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-3xl font-bold">Audit Log</h1>
        <OutlineButton onClick={() => downloadAuditCsv()}>Export Log (CSV)</OutlineButton>
      </div>

      <Bento className="p-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-center">
          <Input placeholder="Search user…" value={user} onChange={(e) => setUser(e.target.value)} />
          <Chip active={postLockOnly} onClick={() => setPostLockOnly(!postLockOnly)}>{postLockOnly ? "✓ Post-lock changes only" : "Post-lock changes only"}</Chip>
          <span className="text-xs text-muted-foreground text-right">{entries.length} entries</span>
        </div>
      </Bento>

      <Bento className="overflow-hidden">
        <table className="w-full text-left text-sm">
          <thead className="bg-background">
            <tr className="text-[10px] tracking-widest uppercase text-muted-foreground">
              <th className="px-3 py-3 font-medium">Timestamp</th>
              <th className="px-3 py-3 font-medium">User</th>
              <th className="px-3 py-3 font-medium">Action</th>
              <th className="px-3 py-3 font-medium">Entity</th>
              <th className="px-3 py-3 font-medium">Previous</th>
              <th className="px-3 py-3 font-medium">New</th>
              <th className="px-3 py-3 font-medium">Trigger</th>
              <th className="px-3 py-3 font-medium">Post-lock</th>
            </tr>
          </thead>
          <tbody>
            {auditQ.isPending ? (
              <tr><td colSpan={8} className="p-0"><SkeletonTable rows={6} cols={8} /></td></tr>
            ) : (
              <>
                {entries.map((a, i) => (
                  <tr key={a.id} className={i % 2 ? "bg-off-black" : "bg-card-bg"}>
                    <td className="px-3 py-3 font-mono text-xs text-gold">{format(new Date(a.timestamp), "yyyy-MM-dd HH:mm:ss")}</td>
                    <td className="px-3 py-3">{a.userName}</td>
                    <td className="px-3 py-3"><span className={`text-[10px] uppercase tracking-widest px-2 py-0.5 border ${colorMap[a.action] ?? "border-line text-muted-foreground"}`}>{a.action}</span></td>
                    <td className="px-3 py-3 text-muted-foreground">{a.entityLabel}</td>
                    <td className="px-3 py-3 font-mono text-xs text-muted-foreground">{a.previousValue ?? "—"}</td>
                    <td className="px-3 py-3 font-mono text-xs text-gold">{a.newValue ?? "—"}</td>
                    <td className="px-3 py-3 text-xs text-muted-foreground">{a.triggeredBy}</td>
                    <td className="px-3 py-3 text-xs">{a.postLock ? <span className="text-destructive">●</span> : "—"}</td>
                  </tr>
                ))}
                {entries.length === 0 && (
                  <tr>
                    <td colSpan={8} className="p-12 text-center">
                      <FileText className="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
                      <h3 className="font-display font-bold text-foreground">No audit entries{user || postLockOnly ? " match these filters" : " yet"}</h3>
                      <p className="text-xs text-muted-foreground mt-1 max-w-sm mx-auto">
                        {user || postLockOnly
                          ? "Try clearing filters or searching for a different user."
                          : "Audit entries appear here whenever a goal, cycle, or user is created or modified."}
                      </p>
                    </td>
                  </tr>
                )}
              </>
            )}
          </tbody>
        </table>
      </Bento>
    </div>
  );
}
