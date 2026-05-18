// Domain types matching the Fastify backend Prisma schema.

export type Role = "EMPLOYEE" | "MANAGER" | "ADMIN";
export type UoM = "NUMERIC" | "PERCENTAGE" | "TIMELINE" | "ZERO_BASED";
export type Direction = "MIN" | "MAX";
export type GoalStatus = "NOT_STARTED" | "ON_TRACK" | "COMPLETED";
export type ApprovalStatus = "DRAFT" | "PENDING" | "APPROVED" | "RETURNED";
export type ThrustArea =
  | "ENERGY_EFFICIENCY"
  | "MARKET_EXPANSION"
  | "PRODUCT_INNOVATION"
  | "CUSTOMER_SUCCESS"
  | "OPERATIONAL_EXCELLENCE";
export type CycleStatus = "UPCOMING" | "ACTIVE" | "CLOSED";
export type CycleKind = "GOAL_SETTING" | "Q1" | "Q2" | "Q3" | "Q4";
export type Quarter = "Q1" | "Q2" | "Q3" | "Q4";
export type NotificationType = "SUBMIT" | "APPROVAL" | "RETURN" | "CHECKIN_REMINDER" | "ESCALATION" | "SHARED_GOAL";

export interface User {
  id: string;
  email: string;
  name: string;
  role: Role;
  department: string;
  managerId: string | null;
  avatar?: string | null;
}

export interface QuarterUpdate {
  id: string;
  goalId: string;
  quarter: Quarter;
  actual: number | null;
  status: GoalStatus;
  note: string | null;
  updatedAt: string;
}

export interface Goal {
  id: string;
  ownerId: string;
  owner?: Pick<User, "id" | "name" | "email"> | null;
  thrustArea: ThrustArea;
  title: string;
  description: string;
  uom: UoM;
  direction: Direction;
  target: number;
  weightage: number;
  approvalStatus: ApprovalStatus;
  locked: boolean;
  returnReason: string | null;
  isSharedPrimary: boolean;
  isSharedClone: boolean;
  sharedPrimaryId: string | null;
  quarters: QuarterUpdate[];
  fiscalYear: string;
  submittedAt: string | null;
  approvedAt: string | null;
  approvedById: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Cycle {
  id: string;
  name: string;
  kind: CycleKind;
  status: CycleStatus;
  openDate: string;
  closeDate: string;
  fiscalYear: string;
}

export interface AuditEntry {
  id: string;
  userName: string;
  userId: string | null;
  action: string;
  entityType: string;
  entityId: string | null;
  entityLabel: string;
  previousValue: string | null;
  newValue: string | null;
  triggeredBy: string;
  postLock: boolean;
  timestamp: string;
}

export interface Notification {
  id: string;
  type: NotificationType;
  message: string;
  link: string | null;
  read: boolean;
  createdAt: string;
}

export interface EscalationRule {
  id: string;
  name: string;
  trigger: "GOAL_NOT_SUBMITTED" | "APPROVAL_PENDING" | "CHECKIN_INCOMPLETE";
  thresholdDays: number;
  enabled: boolean;
}

// Display labels — frontend-friendly strings derived from the enums above.
export const ROLE_LABEL: Record<Role, string> = { EMPLOYEE: "Employee", MANAGER: "Manager", ADMIN: "Admin" };
export const UOM_LABEL: Record<UoM, string> = { NUMERIC: "Numeric", PERCENTAGE: "%", TIMELINE: "Timeline", ZERO_BASED: "Zero-based" };
export const STATUS_LABEL: Record<GoalStatus, string> = { NOT_STARTED: "Not Started", ON_TRACK: "On Track", COMPLETED: "Completed" };
export const APPROVAL_LABEL: Record<ApprovalStatus, string> = { DRAFT: "Draft", PENDING: "Pending", APPROVED: "Approved", RETURNED: "Returned" };
export const THRUST_LABEL: Record<ThrustArea, string> = {
  ENERGY_EFFICIENCY: "Energy Efficiency",
  MARKET_EXPANSION: "Market Expansion",
  PRODUCT_INNOVATION: "Product Innovation",
  CUSTOMER_SUCCESS: "Customer Success",
  OPERATIONAL_EXCELLENCE: "Operational Excellence",
};
export const CYCLE_STATUS_LABEL: Record<CycleStatus, string> = { UPCOMING: "Upcoming", ACTIVE: "Active", CLOSED: "Closed" };

export const THRUST_AREAS: ThrustArea[] = [
  "ENERGY_EFFICIENCY",
  "MARKET_EXPANSION",
  "PRODUCT_INNOVATION",
  "CUSTOMER_SUCCESS",
  "OPERATIONAL_EXCELLENCE",
];
export const UOMS: UoM[] = ["NUMERIC", "PERCENTAGE", "TIMELINE", "ZERO_BASED"];
