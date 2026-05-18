// BRD §5.1 — Role assignment mapped from Azure AD group membership.
//
// Reads two env vars at call time:
//   ENTRA_GROUP_ADMIN    comma-separated group GUIDs that grant ADMIN role
//   ENTRA_GROUP_MANAGER  comma-separated group GUIDs that grant MANAGER role
//
// If a signed-in user's `groups` claim contains any of the ADMIN GUIDs they
// become ADMIN; otherwise any MANAGER match → MANAGER; otherwise EMPLOYEE.
// If the user has no groups at all (e.g. claim not yet enabled in the Azure
// tenant) we return `null` so the caller preserves whatever role is already
// on the GoalFlow user — graceful fallback.

import type { Role } from "@prisma/client";

function parseGuidList(value: string | undefined): string[] {
  if (!value) return [];
  return value
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

export function mapEntraGroupsToRole(groupIds: string[]): Role | null {
  if (!groupIds.length) return null;
  const adminGroups = parseGuidList(process.env.ENTRA_GROUP_ADMIN);
  const managerGroups = parseGuidList(process.env.ENTRA_GROUP_MANAGER);
  const lower = groupIds.map((g) => g.toLowerCase());
  if (adminGroups.length && lower.some((g) => adminGroups.includes(g))) return "ADMIN";
  if (managerGroups.length && lower.some((g) => managerGroups.includes(g))) return "MANAGER";
  return "EMPLOYEE";
}
