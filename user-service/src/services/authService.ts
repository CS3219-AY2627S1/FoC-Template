// AI Assistance Disclosure:
// Tool: Claude (Opus 5.5), date: 2026-11-10
// Scope: Publish USER_REGISTERED after successful registration
// Author review: Reviewed and tested locally

import { env } from "../config/env.js";
import { pool, query } from "../config/db.js";
import {
  generateAccessToken,
  generateRefreshToken,
  hashToken,
} from "../utils/jwt.js";
import { AppError } from "../utils/errors.js";
import {
  isNonEmptyString,
  isAllowedNusEmail,
  isValidPassword,
} from "../utils/validators.js";
import { hashPassword, comparePassword } from "../utils/password.js";
import { initializeWallet } from "./creditService.js";
import { publishUserRegistered } from "../events/userEvents.js";
import type { Role, User } from "../models/types.js";

// ============================================================
// Registration
// ============================================================

export interface RegisterInput {
  username: string;
  email: string;
  password: string;
  firstName: string;
  lastName: string;
}

export const register = async (input: RegisterInput): Promise<User> => {
  const { username, email, password, firstName, lastName } = input;

  // Validate that all required fields are non-empty.
  if (
    !isNonEmptyString(username) ||
    !isNonEmptyString(email) ||
    !isNonEmptyString(password) ||
    !isNonEmptyString(firstName) ||
    !isNonEmptyString(lastName)
  ) {
    throw new AppError(400, "All fields are required and must not be empty.");
  }

  // Normalize input values once and reuse them throughout the registration flow.
  const normalizedUsername = username.trim();
  const normalizedEmail = email.trim().toLowerCase();
  const normalizedFirstName = firstName.trim();
  const normalizedLastName = lastName.trim();

  // Validate business rules after normalization.
  if (!isAllowedNusEmail(normalizedEmail)) {
    throw new AppError(400, "Email domain is not allowed.");
  }

  if (!isValidPassword(password)) {
    throw new AppError(400, "Password must be at least 15 characters long.");
  }

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    // Check for duplicate username or email within the transaction.
    const existingUser = await client.query(
      "SELECT id FROM users WHERE username = $1 OR email = $2",
      [normalizedUsername, normalizedEmail]
    );

    if (existingUser.rows.length > 0) {
      /*
       * Use a unified message to avoid revealing whether a specific
       * username or email is already registered.
       */
      throw new AppError(409, "Username or email is already in use.");
    }

    // Hash the password only after the duplicate check succeeds.
    const passwordHash = await hashPassword(password);

    // Insert the new user.
    const userResult = await client.query(
      `INSERT INTO users (
        username,
        email,
        password_hash,
        first_name,
        last_name
      )
      VALUES ($1, $2, $3, $4, $5)
      RETURNING id, username, email, first_name, last_name`,
      [
        normalizedUsername,
        normalizedEmail,
        passwordHash,
        normalizedFirstName,
        normalizedLastName,
      ]
    );

    const userRow = userResult.rows[0];

    // Load and validate the two default roles assigned to every new user.
    const roleResult = await client.query(
      "SELECT id, name FROM roles WHERE name IN ('REQUESTER', 'COURIER')"
    );

    if (roleResult.rows.length !== 2) {
      throw new AppError(500, "Default roles are not configured correctly.");
    }

    // Assign both default roles to the new user.
    for (const role of roleResult.rows) {
      await client.query(
        "INSERT INTO user_roles (user_id, role_id) VALUES ($1, $2)",
        [userRow.id, role.id]
      );
    }

    await initializeWallet(userRow.id);

    await client.query("COMMIT");

    publishUserRegistered({ user_id: userRow.id, email: userRow.email });

    // Return the user domain model without exposing the password hash.
    return {
      id: userRow.id,
      username: userRow.username,
      email: userRow.email,
      firstName: userRow.first_name,
      lastName: userRow.last_name,
      roles: roleResult.rows.map((row: { name: Role }) => row.name),
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};

// ============================================================
// Login
// ============================================================

export interface LoginInput {
  identifier: string;
  password: string;
}

export interface LoginResponse {
  accessToken: string;
  refreshToken: string;
  user: User;
}

const getUserRoles = async (userId: string): Promise<Role[]> => {
  const result = await query(
    `SELECT r.name
     FROM roles r
     INNER JOIN user_roles ur ON ur.role_id = r.id
     WHERE ur.user_id = $1
     ORDER BY r.name`,
    [userId]
  );

  return result.rows.map((row: { name: Role }) => row.name);
};

export const login = async (
  input: LoginInput
): Promise<LoginResponse> => {
  const { identifier, password } = input;

  // Validate required fields.
  if (!isNonEmptyString(identifier) || !isNonEmptyString(password)) {
    throw new AppError(400, "Identifier and password are required.");
  }

  const normalizedIdentifier = identifier.trim();

  const userResult = await query(
    `SELECT id, username, email, password_hash, first_name, last_name, is_active
     FROM users
     WHERE username = $1 OR email = LOWER($1)`,
    [normalizedIdentifier]
  );

  if (userResult.rows.length === 0) {
    throw new AppError(401, "Invalid credentials.");
  }

  const userRow = userResult.rows[0];

  if (!userRow.is_active) {
    throw new AppError(403, "Account is deactivated.");
  }

  const passwordMatches = await comparePassword(
    password,
    userRow.password_hash
  );

  if (!passwordMatches) {
    throw new AppError(401, "Invalid credentials.");
  }

  const roles = await getUserRoles(userRow.id);
  const accessToken = generateAccessToken(userRow.id, roles);

  // 生成 Refresh Token（有效期 30 天）
  const rawRefreshToken = generateRefreshToken();
  const tokenHash = hashToken(rawRefreshToken);
  const expiresAt = new Date(Date.now() + env.jwt.refreshExpiresDays * 24 * 60 * 60 * 1000);

  await query(
    `INSERT INTO refresh_tokens (user_id, token_hash, expires_at)
     VALUES ($1, $2, $3)`,
    [userRow.id, tokenHash, expiresAt]
  );

  return {
    accessToken,
    refreshToken: rawRefreshToken,
    user: {
      id: userRow.id,
      username: userRow.username,
      email: userRow.email,
      firstName: userRow.first_name,
      lastName: userRow.last_name,
      roles,
    },
  };
};

// ============================================================
// Refresh Token
// ============================================================

export interface RefreshInput {
  refreshToken: string;
}

export interface RefreshResponse {
  accessToken: string;
  refreshToken: string;
  user: User;
}

export const refresh = async (input: RefreshInput): Promise<RefreshResponse> => {
  const { refreshToken } = input;

  if (!isNonEmptyString(refreshToken)) {
    throw new AppError(400, "Refresh token is required.");
  }

  const tokenHash = hashToken(refreshToken.trim());

  const tokenResult = await query(
    `SELECT id, user_id, expires_at, revoked
     FROM refresh_tokens
     WHERE token_hash = $1`,
    [tokenHash]
  );

  if (tokenResult.rows.length === 0) {
    throw new AppError(401, "Invalid refresh token.");
  }

  const tokenRecord = tokenResult.rows[0];

  if (tokenRecord.revoked) {
    throw new AppError(401, "Refresh token has been revoked.");
  }

  if (new Date(tokenRecord.expires_at) <= new Date()) {
    throw new AppError(401, "Refresh token has expired.");
  }

  const userResult = await query(
    `SELECT id, username, email, first_name, last_name, is_active
     FROM users
     WHERE id = $1`,
    [tokenRecord.user_id]
  );

  if (userResult.rows.length === 0 || !userResult.rows[0].is_active) {
    await query(`UPDATE refresh_tokens SET revoked = true WHERE id = $1`, [tokenRecord.id]);
    throw new AppError(401, "User account is inactive or not found.");
  }

  const userRow = userResult.rows[0];
  const roles = await getUserRoles(userRow.id);

  // Token 轮换：作废旧 Refresh Token
  await query(
    `UPDATE refresh_tokens SET revoked = true WHERE id = $1`,
    [tokenRecord.id]
  );

  // 签发新 Refresh Token
  const newRawRefreshToken = generateRefreshToken();
  const newTokenHash = hashToken(newRawRefreshToken);
  const newExpiresAt = new Date(Date.now() + env.jwt.refreshExpiresDays * 24 * 60 * 60 * 1000);

  await query(
    `INSERT INTO refresh_tokens (user_id, token_hash, expires_at)
     VALUES ($1, $2, $3)`,
    [userRow.id, newTokenHash, newExpiresAt]
  );

  const accessToken = generateAccessToken(userRow.id, roles);

  return {
    accessToken,
    refreshToken: newRawRefreshToken,
    user: {
      id: userRow.id,
      username: userRow.username,
      email: userRow.email,
      firstName: userRow.first_name,
      lastName: userRow.last_name,
      roles,
    },
  };
};

// ============================================================
// Logout
// ============================================================

export interface LogoutInput {
  userId: string;
  jti: string;
  exp: number;
  refreshToken?: string;
}

export const logout = async (input: LogoutInput): Promise<void> => {
  const { userId, jti, exp, refreshToken } = input;

  const expiresAt = new Date(exp * 1000);

  await query(
    `INSERT INTO revoked_tokens (jti, user_id, expires_at)
     VALUES ($1, $2, $3)
     ON CONFLICT (jti) DO NOTHING`,
    [jti, userId, expiresAt]
  );

  if (refreshToken && isNonEmptyString(refreshToken)) {
    const tokenHash = hashToken(refreshToken.trim());
    await query(
      `UPDATE refresh_tokens SET revoked = true WHERE token_hash = $1`,
      [tokenHash]
    );
  }
};
