import type { SystemRole } from "../api/user-service";

export function canManageSystemRole(
  actorRole: SystemRole,
  actorUserId: string,
  targetUserId: string,
): boolean {
  return actorRole === "SUPER_ADMIN" && actorUserId !== targetUserId;
}
