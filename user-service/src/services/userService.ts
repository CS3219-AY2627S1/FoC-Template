import type { PoolClient } from "pg";
import { pool, query } from "../config/db.js";
import { AppError } from "../utils/errors.js";
import type { Role } from "../models/types.js";
import {
    isAllowedNusEmail,
    isNonEmptyString,
    isValidEmail,
    isValidPassword,
} from "../utils/validators.js";
import { hashPassword, comparePassword } from "../utils/password.js";
import { initializeWallet } from "./creditService.js";

export interface UserProfileResponse {
  id: string;
  username: string;
  email: string;
  firstName: string;
  lastName: string;
  roles: Role[];
}

export interface UpdateProfileInput {
  username?: string;
  email?: string;
  firstName?: string;
  lastName?: string;
}

// ============================================================
// Get Current User Profile
// ============================================================

export const getCurrentUserProfile = async (
  userId: string
): Promise<UserProfileResponse> => {
  const userResult = await query(
    `SELECT id, username, email, first_name, last_name
     FROM users
     WHERE id = $1 AND is_active = true`,
    [userId]
  );

  if (userResult.rows.length === 0) {
    throw new AppError(404, "User not found or account is deactivated.");
  }

  const user = userResult.rows[0];

  const rolesResult = await query(
    `SELECT r.name
     FROM roles r
     JOIN user_roles ur ON ur.role_id = r.id
     WHERE ur.user_id = $1
     ORDER BY r.name ASC`,
    [userId]
  );

  const roles = rolesResult.rows.map((row: { name: Role }) => row.name);

  return {
    id: user.id,
    username: user.username,
    email: user.email,
    firstName: user.first_name,
    lastName: user.last_name,
    roles,
  };
};

// ============================================================
// Update Current User Profile
// ============================================================

export const updateCurrentUserProfile = async (
  userId: string,
  input: UpdateProfileInput
): Promise<UserProfileResponse> => {
  const username = input.username?.trim();
  const email = input.email?.trim().toLowerCase();
  const firstName = input.firstName?.trim();
  const lastName = input.lastName?.trim();

  // Require at least one field.
  if (
    username === undefined &&
    email === undefined &&
    firstName === undefined &&
    lastName === undefined
  ) {
    throw new AppError(400, "At least one field must be provided for update.");
  }

  // Validate that updated fields are not empty.
  if (
    (username !== undefined && username.length === 0) ||
    (email !== undefined && email.length === 0) ||
    (firstName !== undefined && firstName.length === 0) ||
    (lastName !== undefined && lastName.length === 0)
  ) {
    throw new AppError(400, "Updated fields must not be empty.");
  }

  // Validate email format and NUS domain.
  if (email !== undefined) {
    if (!isValidEmail(email)) {
      throw new AppError(400, "Invalid email format.");
    }

    if (!isAllowedNusEmail(email)) {
      throw new AppError(400, "Email must be a valid NUS email address.");
    }
  }

  let updateResult;

  try {
    updateResult = await query(
      `UPDATE users
       SET username = COALESCE($1, username),
           email = COALESCE($2, email),
           first_name = COALESCE($3, first_name),
           last_name = COALESCE($4, last_name),
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $5 AND is_active = true
       RETURNING id`,
      [
        username ?? null,
        email ?? null,
        firstName ?? null,
        lastName ?? null,
        userId,
      ]
    );
  } catch (error) {
    const dbError = error as {
      code?: string;
      detail?: string;
      constraint?: string;
    };

    if (dbError.code === "23505") {
      if (
        dbError.constraint === "users_username_key" ||
        dbError.detail?.includes("(username)")
      ) {
        throw new AppError(409, "Username is already in use.");
      }

      if (
        dbError.constraint === "users_email_key" ||
        dbError.detail?.includes("(email)")
      ) {
        throw new AppError(409, "Email is already in use.");
      }

      throw new AppError(409, "Username or email is already in use.");
    }

    throw error;
  }

  if (updateResult.rows.length === 0) {
    throw new AppError(404, "User not found or account is deactivated.");
  }

  return getCurrentUserProfile(userId);
};

// AI-generated
// ============================================================
// Initial Admin Provisioning
// ============================================================

interface ProvisionInitialAdminInput {
    email: string;
    password: string;
    username: string;
    firstName: string;
    lastName: string;
}

export const provisionInitialAdmin = async (
    input: ProvisionInitialAdminInput,
    client: PoolClient
): Promise<void> => {
    const {
        email,
        password,
        username,
        firstName,
        lastName,
    } = input;

    const normalizedEmail = email.trim().toLowerCase();
    const normalizedUsername = username.trim();

    if (!isNonEmptyString(normalizedEmail)) {
        throw new AppError(400, "Email is required.");
    }

    if (!isValidEmail(normalizedEmail)) {
        throw new AppError(400, "Invalid email address.");
    }

    if (!isAllowedNusEmail(normalizedEmail)) {
        throw new AppError(400, "Email must be a valid NUS email address.");
    }

    if (!isNonEmptyString(normalizedUsername)) {
        throw new AppError(400, "Username is required.");
    }

    if (!isNonEmptyString(firstName)) {
        throw new AppError(400, "First name is required.");
    }

    if (!isNonEmptyString(lastName)) {
        throw new AppError(400, "Last name is required.");
    }

    if (!isValidPassword(password)) {
        throw new AppError(400, "Password must be at least 15 characters.");
    }

    const existingUser = await client.query(
        `SELECT id
         FROM users
         WHERE email = $1 OR username = $2
         LIMIT 1`,
        [normalizedEmail, normalizedUsername]
    );

    if (existingUser.rows.length > 0) {
        throw new AppError(
            409,
            "Username or email already exists."
        );
    }

    const passwordHash = await hashPassword(password);

    const userResult = await client.query<{ id: string }>(
        `INSERT INTO users (
            username,
            email,
            password_hash,
            first_name,
            last_name
         )
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id`,
        [
            normalizedUsername,
            normalizedEmail,
            passwordHash,
            firstName.trim(),
            lastName.trim(),
        ]
    );

    const userId = userResult.rows[0].id;

    const roleResult = await client.query<{ id: number; name: string }>(
        `SELECT id, name
         FROM roles
         WHERE name IN ('ADMIN', 'REQUESTER', 'COURIER')`,
    );

    if (roleResult.rows.length !== 3) {
        const existingRoleNames = new Set(
            roleResult.rows.map((role) => role.name)
        );
        const missingRoles = ["ADMIN", "REQUESTER", "COURIER"].filter(
            (roleName) => !existingRoleNames.has(roleName)
        );

        throw new AppError(
            500,
            `Required roles are missing: ${missingRoles.join(", ")}`
        );
    }

    for (const role of roleResult.rows) {
        await client.query(
            `INSERT INTO user_roles (user_id, role_id)
             VALUES ($1, $2)`,
            [userId, role.id]
        );
    }

    await initializeWallet(userId);
};

export interface PublicUserProfileResponse {
  id: string;
  username: string;
  firstName: string;
  lastName: string;
  roles: Role[];
}

export const getUserProfileById = async (
  targetUserId: string,
  requestingUserId: string,
  requestingUserRoles: Role[] = []
): Promise<UserProfileResponse | PublicUserProfileResponse> => {
  const userResult = await query(
    `SELECT 
       u.id, 
       u.username, 
       u.email, 
       u.first_name, 
       u.last_name, 
       u.is_active,
       COALESCE(
         ARRAY_AGG(r.name ORDER BY r.name) FILTER (WHERE r.name IS NOT NULL),
         '{}'
       ) AS roles
     FROM users u
     LEFT JOIN user_roles ur ON u.id = ur.user_id
     LEFT JOIN roles r ON ur.role_id = r.id
     WHERE u.id = $1 AND u.is_active = true
     GROUP BY u.id`,
    [targetUserId]
  );

  if (userResult.rows.length === 0) {
    throw new AppError(404, "User not found or account is deactivated.");
  }

  const row = userResult.rows[0];
  const isSelf = requestingUserId === row.id;
  const isAdmin = requestingUserRoles.includes("ADMIN" as Role);

  if (isSelf || isAdmin) {
    return {
      id: row.id,
      username: row.username,
      email: row.email,
      firstName: row.first_name,
      lastName: row.last_name,
      roles: row.roles as Role[],
    };
  }

  return {
    id: row.id,
    username: row.username,
    firstName: row.first_name,
    lastName: row.last_name,
    roles: row.roles as Role[],
  };
};

// AI Assistance Disclosure:
// Tool: Gemini, date: 2026-10-03
// Scope: Implemented getUsersBatch service to fetch public profile summaries
// in bulk using PostgreSQL ANY array query for downstream service consumption.
// Author review: Validated SQL query parameterized types and public field filtering.

// ============================================================
// Batch Get Public User Profiles
// ============================================================

export const getUsersBatch = async (
  userIds: string[]
): Promise<PublicUserProfileResponse[]> => {
  if (!userIds || userIds.length === 0) {
    return [];
  }

  // Deduplicate IDs
  const uniqueIds = Array.from(new Set(userIds));

  const result = await query(
    `SELECT 
       u.id, 
       u.username, 
       u.first_name, 
       u.last_name, 
       COALESCE(
         ARRAY_AGG(r.name ORDER BY r.name) FILTER (WHERE r.name IS NOT NULL),
         '{}'
       ) AS roles
     FROM users u
     LEFT JOIN user_roles ur ON u.id = ur.user_id
     LEFT JOIN roles r ON ur.role_id = r.id
     WHERE u.id = ANY($1::uuid[]) AND u.is_active = true
     GROUP BY u.id`,
    [uniqueIds]
  );

  return result.rows.map((row) => ({
    id: row.id,
    username: row.username,
    firstName: row.first_name,
    lastName: row.last_name,
    roles: row.roles as Role[],
  }));
};

// AI Assistance Disclosure:
// Tool: Gemini, date: 2026-10-03
// Scope: Implemented changePassword service with minimum 15-character password validation,
// secure password comparison using project utils, and active refresh token invalidation using correct 'revoked' column.
// Author review: Validated comparePassword integration and schema column alignment for refresh_tokens.

// ============================================================
// Change Current User Password
// ============================================================

export interface ChangePasswordInput {
  currentPassword: string;
  newPassword: string;
}

export const changePassword = async (
  userId: string,
  input: ChangePasswordInput
): Promise<void> => {
  const { currentPassword, newPassword } = input;

  if (!isNonEmptyString(currentPassword) || !isNonEmptyString(newPassword)) {
    throw new AppError(400, "Both current password and new password are required.");
  }

  if (currentPassword === newPassword) {
    throw new AppError(400, "New password cannot be the same as current password.");
  }

  if (!isValidPassword(newPassword)) {
    throw new AppError(
      400,
      "New password must be at least 15 characters long."
    );
  }

  // 1. Fetch current user password hash
  const userResult = await query(
    `SELECT id, password_hash, is_active FROM users WHERE id = $1`,
    [userId]
  );

  if (userResult.rows.length === 0 || !userResult.rows[0].is_active) {
    throw new AppError(404, "User not found or account is deactivated.");
  }

  const { password_hash: currentHash } = userResult.rows[0];

  // 2. Verify current password
  const isMatch = await comparePassword(currentPassword, currentHash);
  if (!isMatch) {
    throw new AppError(400, "Current password does not match.");
  }

  // 3. Hash new password
  const newHash = await hashPassword(newPassword);

  // 4. Update user password and revoke all existing refresh tokens
  await query(
    `UPDATE users 
     SET password_hash = $1, updated_at = NOW() 
     WHERE id = $2`,
    [newHash, userId]
  );

  // Invalidate all active refresh tokens for this user using correct 'revoked' column
  await query(
    `UPDATE refresh_tokens 
     SET revoked = true 
     WHERE user_id = $1 AND revoked = false`,
    [userId]
  );
};

// ============================================================
// List Users (Admin)
// ============================================================

export interface AdminUserSummary {
  id: string;
  username: string;
  email: string;
  firstName: string;
  lastName: string;
  isActive: boolean;
  roles: Role[];
}

export interface ListUsersInput {
  page: number;
  limit: number;
  search?: string;
}

export interface ListUsersResponse {
  users: AdminUserSummary[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export const listUsers = async (input: ListUsersInput): Promise<ListUsersResponse> => {
  const { page, limit, search } = input;
  const offset = (page - 1) * limit;

  // Escape LIKE wildcards so the search is treated as plain text.
  const searchPattern = search
    ? `%${search.replace(/[\\%_]/g, "\\$&")}%`
    : null;

  const countResult = await query(
    `SELECT COUNT(*)::int AS total
     FROM users u
     WHERE $1::text IS NULL
        OR u.username ILIKE $1 ESCAPE '\\'
        OR u.email ILIKE $1 ESCAPE '\\'`,
    [searchPattern]
  );

  const total: number = countResult.rows[0].total;

  const usersResult = await query(
    `SELECT
       u.id,
       u.username,
       u.email,
       u.first_name,
       u.last_name,
       u.is_active,
       COALESCE(
         ARRAY_AGG(r.name ORDER BY r.name) FILTER (WHERE r.name IS NOT NULL),
         '{}'
       ) AS roles
     FROM users u
     LEFT JOIN user_roles ur ON u.id = ur.user_id
     LEFT JOIN roles r ON ur.role_id = r.id
     WHERE $1::text IS NULL
        OR u.username ILIKE $1 ESCAPE '\\'
        OR u.email ILIKE $1 ESCAPE '\\'
     GROUP BY u.id
     ORDER BY u.username ASC
     LIMIT $2 OFFSET $3`,
    [searchPattern, limit, offset]
  );

  return {
    users: usersResult.rows.map((row) => ({
      id: row.id,
      username: row.username,
      email: row.email,
      firstName: row.first_name,
      lastName: row.last_name,
      isActive: row.is_active,
      roles: row.roles as Role[],
    })),
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
};

// ============================================================
// Update User Active Status (Admin)
// ============================================================

// Serialises status changes so two concurrent deactivations cannot both pass
// the last-active-admin check.
const USER_STATUS_LOCK_KEY = "user-service:user-status";

export const updateUserStatus = async (
  requesterUserId: string,
  targetUserId: string,
  isActive: boolean
): Promise<AdminUserSummary> => {
  if (!isActive && requesterUserId === targetUserId) {
    throw new AppError(400, "You cannot deactivate your own account.");
  }

  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [USER_STATUS_LOCK_KEY]);

    const targetResult = await client.query(
      `SELECT
         u.id,
         u.is_active,
         EXISTS (
           SELECT 1
           FROM user_roles ur
           JOIN roles r ON r.id = ur.role_id
           WHERE ur.user_id = u.id AND r.name = 'ADMIN'
         ) AS is_admin
       FROM users u
       WHERE u.id = $1`,
      [targetUserId]
    );

    if (targetResult.rows.length === 0) {
      throw new AppError(404, "User not found.");
    }

    const target = targetResult.rows[0];

    if (!isActive && target.is_active && target.is_admin) {
      const otherAdminsResult = await client.query(
        `SELECT COUNT(*)::int AS count
         FROM users u
         JOIN user_roles ur ON ur.user_id = u.id
         JOIN roles r ON r.id = ur.role_id
         WHERE r.name = 'ADMIN' AND u.is_active = true AND u.id <> $1`,
        [targetUserId]
      );

      if (otherAdminsResult.rows[0].count === 0) {
        throw new AppError(409, "Cannot deactivate the last active Admin.");
      }
    }

    if (target.is_active !== isActive) {
      await client.query(
        `UPDATE users
         SET is_active = $1, updated_at = NOW()
         WHERE id = $2`,
        [isActive, targetUserId]
      );

      if (!isActive) {
        await client.query(
          `UPDATE refresh_tokens
           SET revoked = true
           WHERE user_id = $1 AND revoked = false`,
          [targetUserId]
        );
      }
    }

    const userResult = await client.query(
      `SELECT
         u.id,
         u.username,
         u.email,
         u.first_name,
         u.last_name,
         u.is_active,
         COALESCE(
           ARRAY_AGG(r.name ORDER BY r.name) FILTER (WHERE r.name IS NOT NULL),
           '{}'
         ) AS roles
       FROM users u
       LEFT JOIN user_roles ur ON u.id = ur.user_id
       LEFT JOIN roles r ON ur.role_id = r.id
       WHERE u.id = $1
       GROUP BY u.id`,
      [targetUserId]
    );

    await client.query("COMMIT");

    const row = userResult.rows[0];

    return {
      id: row.id,
      username: row.username,
      email: row.email,
      firstName: row.first_name,
      lastName: row.last_name,
      isActive: row.is_active,
      roles: row.roles as Role[],
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};
