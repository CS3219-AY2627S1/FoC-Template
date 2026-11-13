import { query } from "../config/db.js";
import { AppError } from "../utils/errors.js";
import type { Role } from "../models/types.js";
import { isValidUuid } from "../utils/validators.js";

export interface UserRoles {
  userId: string;
  roles: Role[];
}

const VALID_ROLES: Role[] = ["ADMIN", "REQUESTER", "COURIER"];

export const getUserRoles = async (userId: string): Promise<UserRoles> => {
  if (!isValidUuid(userId)) {
    throw new AppError(400, "Invalid user ID.");
  }
  const userResult = await query(
        `SELECT id
         FROM users
         WHERE id = $1`,
    [userId]
  );

  if (userResult.rows.length === 0) {
    throw new AppError(404, "User not found.");
  }

  const roleResult = await query(
    `SELECT r.name
     FROM roles r
     INNER JOIN user_roles ur ON ur.role_id = r.id
     WHERE ur.user_id = $1
     ORDER BY r.name`,
    [userId]
  );

  return {
    userId,
    roles: roleResult.rows.map((row) => row.name as Role),
  };
};

export const addRoleToUser = async (userId: string, roleName: string): Promise<UserRoles> => {
  if (!isValidUuid(userId)) {
    throw new AppError(400, "Invalid user ID.");
  }

  if (!VALID_ROLES.includes(roleName as Role)) {
    throw new AppError(400, `Invalid role. Must be one of: ${VALID_ROLES.join(", ")}`);
  }

  const userResult = await query(
    `SELECT id FROM users WHERE id = $1 AND is_active = true`,
    [userId]
  );

  if (userResult.rows.length === 0) {
    throw new AppError(404, "User not found or account is deactivated.");
  }

  const roleResult = await query(
    `SELECT id FROM roles WHERE name = $1`,
    [roleName]
  );

  if (roleResult.rows.length === 0) {
    throw new AppError(400, `Role '${roleName}' does not exist in system.`);
  }

  const roleId = roleResult.rows[0].id;

  await query(
    `INSERT INTO user_roles (user_id, role_id)
     VALUES ($1, $2)
     ON CONFLICT (user_id, role_id) DO NOTHING`,
    [userId, roleId]
  );

  return getUserRoles(userId);
};

export const removeRoleFromUser = async (
  requesterUserId: string,
  targetUserId: string,
  roleName: string
): Promise<UserRoles> => {
  if (!isValidUuid(targetUserId)) {
    throw new AppError(400, "Invalid user ID.");
  }

  if (!VALID_ROLES.includes(roleName as Role)) {
    throw new AppError(400, `Invalid role. Must be one of: ${VALID_ROLES.join(", ")}`);
  }

  // 规则防御 1: 禁止 Admin 撤销自己的 ADMIN 角色
  if (roleName === "ADMIN" && requesterUserId === targetUserId) {
    throw new AppError(400, "Cannot revoke ADMIN role from yourself.");
  }

  const userResult = await query(
    `SELECT id FROM users WHERE id = $1 AND is_active = true`,
    [targetUserId]
  );

  if (userResult.rows.length === 0) {
    throw new AppError(404, "User not found or account is deactivated.");
  }

  const currentRoles = await getUserRoles(targetUserId);

  if (!currentRoles.roles.includes(roleName as Role)) {
    return currentRoles;
  }

  // 规则防御 2: 不能移除用户的唯一角色
  if (currentRoles.roles.length <= 1) {
    throw new AppError(400, "Cannot remove the user's only remaining role.");
  }

  const roleResult = await query(
    `SELECT id FROM roles WHERE name = $1`,
    [roleName]
  );

  if (roleResult.rows.length === 0) {
    throw new AppError(400, `Role '${roleName}' does not exist in system.`);
  }

  const roleId = roleResult.rows[0].id;

  await query(
    `DELETE FROM user_roles
     WHERE user_id = $1 AND role_id = $2`,
    [targetUserId, roleId]
  );

  return getUserRoles(targetUserId);
};
