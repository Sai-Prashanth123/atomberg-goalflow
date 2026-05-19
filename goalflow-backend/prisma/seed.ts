import { PrismaClient, type Quarter } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

// ─── time helpers ───────────────────────────────────────────────────────────
const NOW = new Date();
const DAY = 24 * 60 * 60 * 1000;
const HOUR = 60 * 60 * 1000;
const daysAgo = (n: number) => new Date(NOW.getTime() - n * DAY);
const hoursAgo = (n: number) => new Date(NOW.getTime() - n * HOUR);

async function main() {
  console.log("→ seeding GoalFlow demo dataset (slim, BRD-aligned, hackathon submission)…");

  // Per-user passwords:
  //   - The 3 judging accounts (Rohan/Priya/Aarav) use unique strong passwords,
  //     documented in docs/JUDGES-LOGIN-GUIDE.md.
  //   - The 4 supporting users (Karthik/Neha/Vikram/Arjun) keep `password123` —
  //     they exist only for demo-data variety; judges don't log in as them.
  const adminHash      = await bcrypt.hash("Atomberg#Govern!2026X9",  8);
  const managerHash    = await bcrypt.hash("Atomberg#Review!2026K4",  8);
  const employeeHash   = await bcrypt.hash("Atomberg#Goalset!2026P7", 8);
  const supportingHash = await bcrypt.hash("password123",             8);

  // ── wipe (FK-safe order) ────────────────────────────────────────────────
  await prisma.escalationEvent.deleteMany();
  await prisma.escalationRule.deleteMany();
  await prisma.notification.deleteMany();
  await prisma.auditEntry.deleteMany();
  await prisma.quarterUpdate.deleteMany();
  await prisma.goal.deleteMany();
  await prisma.cycle.deleteMany();
  await prisma.user.deleteMany();

  // ── 1. USERS (7) — Admin + 2 Managers + 4 Employees across 2 departments ────
  await prisma.user.createMany({
    data: [
      { id: "usr_rohan",   email: "rohan@atomberg.com",   name: "Rohan Kapoor",   passwordHash: adminHash,      role: "ADMIN",    department: "Operations",  managerId: null,          createdAt: daysAgo(60), updatedAt: NOW },
      { id: "usr_priya",   email: "priya@atomberg.com",   name: "Priya Iyer",     passwordHash: managerHash,    role: "MANAGER",  department: "Engineering", managerId: "usr_rohan",   createdAt: daysAgo(55), updatedAt: NOW },
      { id: "usr_karthik", email: "karthik@atomberg.com", name: "Karthik Reddy",  passwordHash: supportingHash, role: "MANAGER",  department: "Sales",       managerId: "usr_rohan",   createdAt: daysAgo(55), updatedAt: NOW },
      { id: "usr_aarav",   email: "aarav@atomberg.com",   name: "Aarav Mehta",    passwordHash: employeeHash,   role: "EMPLOYEE", department: "Engineering", managerId: "usr_priya",   createdAt: daysAgo(50), updatedAt: NOW },
      { id: "usr_neha",    email: "neha@atomberg.com",    name: "Neha Sharma",    passwordHash: supportingHash, role: "EMPLOYEE", department: "Engineering", managerId: "usr_priya",   createdAt: daysAgo(50), updatedAt: NOW },
      { id: "usr_vikram",  email: "vikram@atomberg.com",  name: "Vikram Singh",   passwordHash: supportingHash, role: "EMPLOYEE", department: "Engineering", managerId: "usr_priya",   createdAt: daysAgo(30), updatedAt: NOW },
      { id: "usr_arjun",   email: "arjun@atomberg.com",   name: "Arjun Nair",     passwordHash: supportingHash, role: "EMPLOYEE", department: "Sales",       managerId: "usr_karthik", createdAt: daysAgo(50), updatedAt: NOW },
    ],
  });
  console.log("  · 7 users seeded (3 with strong passwords, 4 supporting w/ password123)");

  // ── 2. CYCLES (5) — BRD §2.3 calendar; Q1 ACTIVE so judges can save check-ins ──
  await prisma.cycle.createMany({
    data: [
      { id: "cyc_fy27_gs", name: "FY27 — Goal Setting", kind: "GOAL_SETTING", status: "CLOSED",   openDate: new Date("2026-04-01"), closeDate: new Date("2026-05-14"), fiscalYear: "2027", createdAt: NOW, updatedAt: NOW },
      { id: "cyc_fy27_q1", name: "FY27 — Q1 Check-in",  kind: "Q1",           status: "ACTIVE",   openDate: new Date("2026-05-15"), closeDate: new Date("2026-08-15"), fiscalYear: "2027", createdAt: NOW, updatedAt: NOW },
      { id: "cyc_fy27_q2", name: "FY27 — Q2 Check-in",  kind: "Q2",           status: "UPCOMING", openDate: new Date("2026-09-01"), closeDate: new Date("2026-11-15"), fiscalYear: "2027", createdAt: NOW, updatedAt: NOW },
      { id: "cyc_fy27_q3", name: "FY27 — Q3 Check-in",  kind: "Q3",           status: "UPCOMING", openDate: new Date("2026-12-01"), closeDate: new Date("2027-02-15"), fiscalYear: "2027", createdAt: NOW, updatedAt: NOW },
      { id: "cyc_fy27_q4", name: "FY27 — Q4 / Annual",  kind: "Q4",           status: "UPCOMING", openDate: new Date("2027-03-01"), closeDate: new Date("2027-04-30"), fiscalYear: "2027", createdAt: NOW, updatedAt: NOW },
    ],
  });
  console.log("  · 5 cycles seeded");

  // ── 3. REGULAR GOALS (11) + SHARED PRIMARY (1) ──────────────────────────
  // Designed so every BRD §2.1/2.2 feature shows up in 2-3 examples:
  //  - Aarav covers ALL 4 approval states (APPROVED+LOCKED ×2 / PENDING / RETURNED)
  //    and 3 UoMs (TIMELINE / ZERO_BASED / NUMERIC) + both directions (MIN + MAX)
  //  - Neha shows the "all approved + Q1 fully done" path, covers PERCENTAGE UoM
  //  - Vikram has DRAFTs only — feeds GOAL_NOT_SUBMITTED escalation rule
  //  - Arjun is fully approved but never filed Q1 → CHECKIN_INCOMPLETE target
  await prisma.goal.createMany({
    data: [
      // Aarav (5 goals = 4 regular + shared clone below, all weights sum to 100%)
      { id: "goal_aarav_1", ownerId: "usr_aarav", cycleId: "cyc_fy27_gs", thrustArea: "PRODUCT_INNOVATION",     title: "Ship BLDC Fan v4 with smart controls", description: "Launch next-gen smart-controlled BLDC fan SKU with companion app + IoT firmware.",                       uom: "TIMELINE",   direction: "MIN", target: 90, weightage: 30, approvalStatus: "APPROVED", locked: true,  returnReason: null,                                                                                                                       isSharedPrimary: false, isSharedClone: false, sharedPrimaryId: null, fiscalYear: "2027", createdAt: daysAgo(20), updatedAt: NOW, submittedAt: daysAgo(15), approvedAt: daysAgo(12), approvedById: "usr_priya" },
      { id: "goal_aarav_2", ownerId: "usr_aarav", cycleId: "cyc_fy27_gs", thrustArea: "OPERATIONAL_EXCELLENCE", title: "Zero critical production incidents",   description: "Maintain P0 incident count at zero via canary deploys and on-call hardening.",                            uom: "ZERO_BASED", direction: "MIN", target: 0,  weightage: 20, approvalStatus: "APPROVED", locked: true,  returnReason: null,                                                                                                                       isSharedPrimary: false, isSharedClone: false, sharedPrimaryId: null, fiscalYear: "2027", createdAt: daysAgo(20), updatedAt: NOW, submittedAt: daysAgo(15), approvedAt: daysAgo(12), approvedById: "usr_priya" },
      { id: "goal_aarav_3", ownerId: "usr_aarav", cycleId: "cyc_fy27_gs", thrustArea: "CUSTOMER_SUCCESS",       title: "Reduce mean support TAT to under 24h", description: "Lower-is-better. Currently 36h. Lower mean ticket turnaround via tier-1 triage automation.",                uom: "NUMERIC",    direction: "MAX", target: 24, weightage: 20, approvalStatus: "PENDING",  locked: false, returnReason: null,                                                                                                                       isSharedPrimary: false, isSharedClone: false, sharedPrimaryId: null, fiscalYear: "2027", createdAt: daysAgo(10), updatedAt: NOW, submittedAt: daysAgo(6),  approvedAt: null,        approvedById: null },
      { id: "goal_aarav_4", ownerId: "usr_aarav", cycleId: "cyc_fy27_gs", thrustArea: "MARKET_EXPANSION",       title: "Expand to 3 Tier-2 cities",            description: "Pilot direct-to-consumer storefront in 3 Tier-2 cities with last-mile partner onboarding.",                uom: "NUMERIC",    direction: "MIN", target: 3,  weightage: 20, approvalStatus: "RETURNED", locked: false, returnReason: "Please right-size the Q1 commitment — aim for 2 cities first, then expand in Q2 once the launch playbook is validated.", isSharedPrimary: false, isSharedClone: false, sharedPrimaryId: null, fiscalYear: "2027", createdAt: daysAgo(12), updatedAt: NOW, submittedAt: daysAgo(8),  approvedAt: null,        approvedById: null },

      // Neha — all APPROVED + Q1 fully done; covers PERCENTAGE UoM
      { id: "goal_neha_1", ownerId: "usr_neha", cycleId: "cyc_fy27_gs", thrustArea: "MARKET_EXPANSION",       title: "Achieve ₹12 Cr regional revenue", description: "Hit ₹12 Cr annual revenue for the Western region across all SKUs.", uom: "NUMERIC",    direction: "MIN", target: 12, weightage: 50, approvalStatus: "APPROVED", locked: true, returnReason: null, isSharedPrimary: false, isSharedClone: false, sharedPrimaryId: null, fiscalYear: "2027", createdAt: daysAgo(20), updatedAt: NOW, submittedAt: daysAgo(15), approvedAt: daysAgo(12), approvedById: "usr_priya" },
      { id: "goal_neha_2", ownerId: "usr_neha", cycleId: "cyc_fy27_gs", thrustArea: "OPERATIONAL_EXCELLENCE", title: "Reduce order cycle time by 20%",  description: "Compress order-to-dispatch from 5 days to under 4 days.",         uom: "PERCENTAGE", direction: "MIN", target: 20, weightage: 40, approvalStatus: "APPROVED", locked: true, returnReason: null, isSharedPrimary: false, isSharedClone: false, sharedPrimaryId: null, fiscalYear: "2027", createdAt: daysAgo(20), updatedAt: NOW, submittedAt: daysAgo(15), approvedAt: daysAgo(12), approvedById: "usr_priya" },

      // Vikram — DRAFTS at 50% (submit-validation blocker + GOAL_NOT_SUBMITTED escalation)
      { id: "goal_vikram_1", ownerId: "usr_vikram", cycleId: "cyc_fy27_gs", thrustArea: "OPERATIONAL_EXCELLENCE", title: "Migrate platform to AWS",    description: "Cutover from on-prem to AWS — VPC design, RDS migration, zero-downtime switch.", uom: "TIMELINE",   direction: "MIN", target: 120, weightage: 30, approvalStatus: "DRAFT", locked: false, returnReason: null, isSharedPrimary: false, isSharedClone: false, sharedPrimaryId: null, fiscalYear: "2027", createdAt: daysAgo(5), updatedAt: NOW, submittedAt: null, approvedAt: null, approvedById: null },
      { id: "goal_vikram_2", ownerId: "usr_vikram", cycleId: "cyc_fy27_gs", thrustArea: "OPERATIONAL_EXCELLENCE", title: "CI/CD test coverage to 80%", description: "Raise automated test coverage from 58% to 80% across backend services.",     uom: "PERCENTAGE", direction: "MIN", target: 80,  weightage: 20, approvalStatus: "DRAFT", locked: false, returnReason: null, isSharedPrimary: false, isSharedClone: false, sharedPrimaryId: null, fiscalYear: "2027", createdAt: daysAgo(3), updatedAt: NOW, submittedAt: null, approvedAt: null, approvedById: null },

      // Arjun — all APPROVED but ZERO Q1 actuals (CHECKIN_INCOMPLETE escalation target)
      { id: "goal_arjun_1", ownerId: "usr_arjun", cycleId: "cyc_fy27_gs", thrustArea: "MARKET_EXPANSION",       title: "Hit ₹8 Cr regional revenue",    description: "Achieve ₹8 Cr revenue from the Northern region across the year.",     uom: "NUMERIC", direction: "MIN", target: 8, weightage: 55, approvalStatus: "APPROVED", locked: true, returnReason: null, isSharedPrimary: false, isSharedClone: false, sharedPrimaryId: null, fiscalYear: "2027", createdAt: daysAgo(25), updatedAt: NOW, submittedAt: daysAgo(20), approvedAt: daysAgo(17), approvedById: "usr_karthik" },
      { id: "goal_arjun_2", ownerId: "usr_arjun", cycleId: "cyc_fy27_gs", thrustArea: "OPERATIONAL_EXCELLENCE", title: "Reduce stock-out days below 3", description: "Lower-is-better. Cut mean stock-out duration from 6 days to under 3.", uom: "NUMERIC", direction: "MAX", target: 3, weightage: 35, approvalStatus: "APPROVED", locked: true, returnReason: null, isSharedPrimary: false, isSharedClone: false, sharedPrimaryId: null, fiscalYear: "2027", createdAt: daysAgo(25), updatedAt: NOW, submittedAt: daysAgo(20), approvedAt: daysAgo(17), approvedById: "usr_karthik" },

      // SHARED PRIMARY — Rohan pushes org-wide sustainability goal
      { id: "goal_shared_primary", ownerId: "usr_rohan", cycleId: "cyc_fy27_gs", thrustArea: "OPERATIONAL_EXCELLENCE", title: "Atomberg sustainability index — 90+", description: "Org-wide ESG/sustainability KPI pushed by Operations. Composite score across energy, packaging, carbon.", uom: "NUMERIC", direction: "MIN", target: 90, weightage: 10, approvalStatus: "APPROVED", locked: true, returnReason: null, isSharedPrimary: true, isSharedClone: false, sharedPrimaryId: null, fiscalYear: "2027", createdAt: daysAgo(22), updatedAt: NOW, submittedAt: daysAgo(20), approvedAt: daysAgo(20), approvedById: "usr_rohan" },
    ],
  });

  // ── 4. SHARED CLONES (3) — pushed to Aarav, Neha, Arjun ─────────────────
  const sharedCloneTemplate = {
    cycleId: "cyc_fy27_gs",
    thrustArea: "OPERATIONAL_EXCELLENCE" as const,
    title: "Atomberg sustainability index — 90+",
    description: "Org-wide ESG/sustainability KPI pushed by Operations. Composite score across energy, packaging, carbon.",
    uom: "NUMERIC" as const,
    direction: "MIN" as const,
    target: 90,
    weightage: 10,
    approvalStatus: "APPROVED" as const,
    locked: true,
    isSharedPrimary: false,
    isSharedClone: true,
    sharedPrimaryId: "goal_shared_primary",
    fiscalYear: "2027",
    createdAt: daysAgo(20),
    updatedAt: NOW,
    submittedAt: daysAgo(18),
    approvedAt: daysAgo(18),
    approvedById: "usr_rohan",
  };
  await prisma.goal.createMany({
    data: [
      { id: "goal_shared_aarav", ownerId: "usr_aarav", ...sharedCloneTemplate },
      { id: "goal_shared_neha",  ownerId: "usr_neha",  ...sharedCloneTemplate },
      { id: "goal_shared_arjun", ownerId: "usr_arjun", ...sharedCloneTemplate },
    ],
  });
  console.log("  · 14 goals seeded (12 regular incl. shared primary + 3 clones)");

  // ── 5. QUARTER UPDATES (14 × 4 = 56 rows; 7 Q1 actuals filled) ──────────
  type Q1Patch = { actual: number; status: "ON_TRACK" | "COMPLETED"; note: string; updatedById: string; daysAgo: number };
  const q1Actuals: Record<string, Q1Patch> = {
    goal_aarav_1:        { actual: 35,  status: "ON_TRACK",  note: "Pilot 200 homes shipped; firmware v0.9 in beta.",          updatedById: "usr_aarav", daysAgo: 3 },
    goal_aarav_2:        { actual: 0,   status: "COMPLETED", note: "Zero P0s this quarter. Canary deploys working as expected.", updatedById: "usr_aarav", daysAgo: 2 },
    goal_shared_aarav:   { actual: 87,  status: "ON_TRACK",  note: "Org sustainability index tracking on plan.",                updatedById: "usr_aarav", daysAgo: 4 },
    goal_neha_1:         { actual: 4.2, status: "ON_TRACK",  note: "Q1 revenue at ₹4.2 Cr — 35% of annual plan.",               updatedById: "usr_neha",  daysAgo: 5 },
    goal_neha_2:         { actual: 12,  status: "ON_TRACK",  note: "Routing optimization cut cycle time by 12% so far.",        updatedById: "usr_neha",  daysAgo: 4 },
    goal_shared_neha:    { actual: 87,  status: "ON_TRACK",  note: "Org sustainability index tracking on plan.",                updatedById: "usr_neha",  daysAgo: 4 },
    goal_shared_primary: { actual: 87,  status: "ON_TRACK",  note: "Composite ESG score — 6 of 10 metrics ahead of plan.",      updatedById: "usr_rohan", daysAgo: 7 },
    // Aarav PENDING/RETURNED, Vikram drafts, Arjun's goals — all stay NULL (each demos a different state)
  };

  const allGoalIds = [
    "goal_aarav_1", "goal_aarav_2", "goal_aarav_3", "goal_aarav_4",
    "goal_neha_1", "goal_neha_2",
    "goal_vikram_1", "goal_vikram_2",
    "goal_arjun_1", "goal_arjun_2",
    "goal_shared_primary", "goal_shared_aarav", "goal_shared_neha", "goal_shared_arjun",
  ];
  const quarters: Quarter[] = ["Q1", "Q2", "Q3", "Q4"];
  const quarterRows = allGoalIds.flatMap((goalId) =>
    quarters.map((quarter) => {
      const patch = quarter === "Q1" ? q1Actuals[goalId] : undefined;
      if (patch) {
        return { id: `qu_${goalId}_${quarter}`, goalId, quarter, actual: patch.actual, status: patch.status, note: patch.note, updatedById: patch.updatedById, updatedAt: daysAgo(patch.daysAgo) };
      }
      return { id: `qu_${goalId}_${quarter}`, goalId, quarter, actual: null, status: "NOT_STARTED" as const, note: null, updatedById: null, updatedAt: NOW };
    }),
  );
  await prisma.quarterUpdate.createMany({ data: quarterRows });
  console.log(`  · ${quarterRows.length} quarter-update rows seeded (7 with Q1 actuals)`);

  // ── 6. ESCALATION RULES (4) — 3 enabled + 1 disabled (toggle demo) ──────
  await prisma.escalationRule.createMany({
    data: [
      { id: "rule_submit",      name: "Submit-overdue",        trigger: "GOAL_NOT_SUBMITTED", thresholdDays: 7,  enabled: true,  createdAt: daysAgo(45), updatedAt: NOW },
      { id: "rule_approval",    name: "Approval-stale",        trigger: "APPROVAL_PENDING",   thresholdDays: 5,  enabled: true,  createdAt: daysAgo(45), updatedAt: NOW },
      { id: "rule_checkin",     name: "Check-in-incomplete",   trigger: "CHECKIN_INCOMPLETE", thresholdDays: 10, enabled: true,  createdAt: daysAgo(45), updatedAt: NOW },
      { id: "rule_quick_check", name: "Quick check-in nudge",  trigger: "CHECKIN_INCOMPLETE", thresholdDays: 3,  enabled: false, createdAt: daysAgo(40), updatedAt: NOW },
    ],
  });

  // ── 7. ESCALATION EVENTS (4) — L1 ×2 + L2 + L3 (one resolved) ───────────
  await prisma.escalationEvent.createMany({
    data: [
      { id: "evt_l1_aarav_pending", ruleId: "rule_approval", targetId: "usr_aarav",  escalatedToId: "usr_priya", level: 1, reason: "Approval-stale — Aarav Mehta (APPROVAL_PENDING) at level 1",          resolved: false, createdAt: daysAgo(1) },
      { id: "evt_l1_vikram_submit", ruleId: "rule_submit",   targetId: "usr_vikram", escalatedToId: "usr_priya", level: 1, reason: "Submit-overdue — Vikram Singh (GOAL_NOT_SUBMITTED) at level 1",        resolved: false, createdAt: hoursAgo(12) },
      { id: "evt_l2_arjun_checkin", ruleId: "rule_checkin",  targetId: "usr_arjun",  escalatedToId: "usr_rohan", level: 2, reason: "Check-in-incomplete — Arjun Nair (CHECKIN_INCOMPLETE) at level 2",     resolved: false, createdAt: hoursAgo(3) },
      { id: "evt_l3_aarav_old",     ruleId: "rule_approval", targetId: "usr_aarav",  escalatedToId: "usr_rohan", level: 3, reason: "Approval-stale — Aarav Mehta (APPROVAL_PENDING) at level 3 (cleared)", resolved: true,  createdAt: daysAgo(8) },
    ],
  });
  console.log("  · 4 escalation rules + 4 events seeded (L1×2 + L2 + L3, one resolved)");

  // ── 8. NOTIFICATIONS (10) — covers every NotificationType ───────────────
  await prisma.notification.createMany({
    data: [
      { id: "ntf_aarav_1",   userId: "usr_aarav",   type: "APPROVAL",         message: 'Your goal "Ship BLDC Fan v4 with smart controls" was approved by Priya Iyer.', link: "/employee/goals",         read: true,  createdAt: daysAgo(12) },
      { id: "ntf_aarav_2",   userId: "usr_aarav",   type: "RETURN",           message: 'Your goal "Expand to 3 Tier-2 cities" was returned by Priya Iyer.',             link: "/employee/goals",         read: false, createdAt: daysAgo(8) },
      { id: "ntf_aarav_3",   userId: "usr_aarav",   type: "CHECKIN_REMINDER", message: "Q1 check-in window is open. Update your actuals for FY27 Q1.",                  link: "/employee/check-in",      read: true,  createdAt: daysAgo(3) },
      { id: "ntf_aarav_4",   userId: "usr_aarav",   type: "SHARED_GOAL",      message: "Rohan Kapoor pushed a new shared goal: Atomberg sustainability index — 90+.",  link: "/employee/goals",         read: true,  createdAt: daysAgo(20) },
      { id: "ntf_priya_1",   userId: "usr_priya",   type: "SUBMIT",           message: 'Aarav Mehta submitted "Reduce mean support TAT to under 24h" for review.',     link: "/manager/team/usr_aarav", read: false, createdAt: daysAgo(6) },
      { id: "ntf_priya_2",   userId: "usr_priya",   type: "ESCALATION",       message: "Escalation (L1): Approval-stale — Aarav Mehta (APPROVAL_PENDING)",              link: "/admin/escalations",      read: false, createdAt: daysAgo(1) },
      { id: "ntf_karthik_1", userId: "usr_karthik", type: "SUBMIT",           message: "Arjun Nair submitted 2 goals for review.",                                       link: "/manager/team/usr_arjun", read: true,  createdAt: daysAgo(20) },
      { id: "ntf_rohan_1",   userId: "usr_rohan",   type: "ESCALATION",       message: "Escalation (L2): Check-in-incomplete — Arjun Nair (CHECKIN_INCOMPLETE)",        link: "/admin/escalations",      read: false, createdAt: hoursAgo(3) },
      { id: "ntf_neha_1",    userId: "usr_neha",    type: "APPROVAL",         message: "Both of your goals were approved by Priya Iyer.",                                link: "/employee/goals",         read: true,  createdAt: daysAgo(12) },
      { id: "ntf_arjun_1",   userId: "usr_arjun",   type: "CHECKIN_REMINDER", message: "Reminder: Q1 check-ins still pending across your goals.",                        link: "/employee/check-in",      read: false, createdAt: daysAgo(1) },
    ],
  });
  console.log("  · 10 notifications seeded");

  // ── 9. AUDIT ENTRIES (8) — full lifecycle incl. 2 post-lock changes ─────
  await prisma.auditEntry.createMany({
    data: [
      { id: "aud_01", userId: null,        userName: "System",       action: "Cycle Opened",         entityType: "CYCLE",       entityId: "cyc_fy27_q1",        entityLabel: "FY27 — Q1 Check-in",                  previousValue: "UPCOMING",      newValue: "ACTIVE",                                 triggeredBy: "Scheduler",      postLock: false, timestamp: daysAgo(3) },
      { id: "aud_02", userId: "usr_priya", userName: "Priya Iyer",   action: "Approved Goal",        entityType: "GOAL",        entityId: "goal_aarav_1",       entityLabel: "Ship BLDC Fan v4 with smart controls", previousValue: "PENDING",       newValue: "APPROVED",                               triggeredBy: "Manager Review", postLock: false, timestamp: daysAgo(12) },
      { id: "aud_03", userId: "usr_priya", userName: "Priya Iyer",   action: "Returned Goal",        entityType: "GOAL",        entityId: "goal_aarav_4",       entityLabel: "Expand to 3 Tier-2 cities",            previousValue: "PENDING",       newValue: "RETURNED (with reason)",                 triggeredBy: "Manager Review", postLock: false, timestamp: daysAgo(8) },
      { id: "aud_04", userId: "usr_rohan", userName: "Rohan Kapoor", action: "Pushed Shared Goal",   entityType: "SHARED_GOAL", entityId: "goal_shared_primary", entityLabel: "Atomberg sustainability index — 90+", previousValue: null,            newValue: "3 recipients",                           triggeredBy: "Admin Action",   postLock: false, timestamp: daysAgo(20) },
      { id: "aud_05", userId: "usr_aarav", userName: "Aarav Mehta",  action: "Synced from Entra ID", entityType: "USER",        entityId: "usr_aarav",          entityLabel: "Aarav Mehta",                          previousValue: "manager: null", newValue: "manager: Priya Iyer",                    triggeredBy: "Entra Sync",     postLock: false, timestamp: daysAgo(50) },
      { id: "aud_06", userId: "usr_rohan", userName: "Rohan Kapoor", action: "Admin Unlocked Goal",  entityType: "GOAL",        entityId: "goal_aarav_1",       entityLabel: "Ship BLDC Fan v4 with smart controls", previousValue: "locked: true",  newValue: "locked: false",                          triggeredBy: "Admin Action",   postLock: true,  timestamp: daysAgo(4) },
      { id: "aud_07", userId: "usr_priya", userName: "Priya Iyer",   action: "Edited Locked Goal",   entityType: "GOAL",        entityId: "goal_aarav_1",       entityLabel: "Ship BLDC Fan v4 with smart controls", previousValue: "target: 100",   newValue: "target: 90",                             triggeredBy: "Manager Review", postLock: true,  timestamp: daysAgo(4) },
      { id: "aud_08", userId: null,        userName: "System",       action: "Escalation Raised",    entityType: "ESCALATION",  entityId: "evt_l2_arjun_checkin", entityLabel: "Check-in-incomplete — L2",            previousValue: null,            newValue: "Target: Arjun Nair → Rohan Kapoor",      triggeredBy: "Scheduler",      postLock: false, timestamp: hoursAgo(3) },
    ],
  });
  console.log("  · 8 audit entries seeded (2 post-lock)");

  console.log("✓ slim demo seed complete — matches MCP curated state");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
