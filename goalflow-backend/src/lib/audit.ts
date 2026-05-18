import type { PrismaClient } from "@prisma/client";
import type { AuthUser } from "../plugins/auth.js";

export type AuditWrite = {
  action: string;
  entityType: "GOAL" | "CYCLE" | "USER" | "SHARED_GOAL" | "QUARTER" | "ESCALATION";
  entityId?: string;
  entityLabel: string;
  previousValue?: string | null;
  newValue?: string | null;
  triggeredBy: string;
  postLock?: boolean;
};

export async function writeAudit(
  prisma: PrismaClient,
  actor: AuthUser | { sub: string; name: string } | null,
  entry: AuditWrite,
) {
  return prisma.auditEntry.create({
    data: {
      userId: actor?.sub ?? null,
      userName: actor?.name ?? "System",
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId,
      entityLabel: entry.entityLabel,
      previousValue: entry.previousValue ?? null,
      newValue: entry.newValue ?? null,
      triggeredBy: entry.triggeredBy,
      postLock: entry.postLock ?? false,
    },
  });
}
