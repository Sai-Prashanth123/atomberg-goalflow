import type { Cycle, CycleKind, PrismaClient, Quarter } from "@prisma/client";

const KIND_TO_QUARTER: Record<CycleKind, Quarter | null> = {
  GOAL_SETTING: null,
  Q1: "Q1",
  Q2: "Q2",
  Q3: "Q3",
  Q4: "Q4",
};

export async function getActiveCycle(prisma: PrismaClient): Promise<Cycle | null> {
  const now = new Date();
  return prisma.cycle.findFirst({
    where: { status: "ACTIVE", openDate: { lte: now }, closeDate: { gte: now } },
    orderBy: { openDate: "desc" },
  });
}

export async function getActiveQuarter(prisma: PrismaClient): Promise<Quarter | null> {
  const c = await getActiveCycle(prisma);
  if (!c) return null;
  return KIND_TO_QUARTER[c.kind];
}

export function isWithinCycle(c: Cycle, when = new Date()): boolean {
  return c.status === "ACTIVE" && when >= c.openDate && when <= c.closeDate;
}
