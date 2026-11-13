/**
 * Server-side client for User Service. Only import this from Server Actions,
 * Route Handlers or Server Components: the bearer token must never reach the
 * browser, and User Service is only reachable on the Compose network.
 * `server-only` makes a client import fail the build.
 *
 * Request bodies are built field by field: callers pass objects that came
 * from the browser, and User Service rejects any field it doesn't expect.
 */

import 'server-only';

import { type Page, withQuery } from '@/lib/service-request';

const BASE_URL = process.env.USER_SERVICE_URL ?? 'https://localhost:8080';
const TIMEOUT_MS = 5000;

export type UserRole = 'user' | 'admin';
export type UserStatus = 'active' | 'deactivated' | 'suspended';

export type User = {
  id: string;
  nus_student_number: string;
  email: string;
  display_name: string;
  role: UserRole;
  status: UserStatus;
  created_at: string;
  updated_at: string;
};

export type LoginResponse = {
  access_token: string;
  token_type: 'bearer';
  /** Inactivity lifetime in seconds; User Service extends it on use. */
  expires_in: number;
  user: User;
};

export type Credentials = {
  nus_student_number: string;
  password: string;
};

/** Filters for the administrator account list; all are optional. */
export type UserListQuery = {
  q?: string;
  status?: UserStatus;
  limit?: number;
  offset?: number;
};

export type UserCreate = Credentials & {
  email: string;
  display_name: string;
};

export type UserUpdate = Partial<
  Pick<UserCreate, 'email' | 'display_name' | 'password'>
>;

/** Field name → first validation message User Service reported for it. */
export type FieldErrors = Partial<Record<string, string>>;

export class UserServiceError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly fieldErrors: FieldErrors = {},
  ) {
    super(message);
    this.name = 'UserServiceError';
  }
}

type ValidationIssue = { loc?: (string | number)[]; msg?: string };

/** FastAPI validation errors are `{detail: [{loc, msg}]}`; others `{detail}`. */
function parseError(status: number, body: unknown): UserServiceError {
  const detail = (body as { detail?: unknown } | null)?.detail;

  if (Array.isArray(detail)) {
    const fieldErrors: FieldErrors = {};
    for (const issue of detail as ValidationIssue[]) {
      const field = issue.loc?.at(-1);
      if (typeof field === 'string' && !fieldErrors[field] && issue.msg) {
        fieldErrors[field] = issue.msg.replace(/^Value error, /, '');
      }
    }
    return new UserServiceError(
      status,
      'Some fields are invalid.',
      fieldErrors,
    );
  }

  return new UserServiceError(
    status,
    typeof detail === 'string' ? detail : 'User Service request failed.',
  );
}

async function request<T>(
  path: string,
  {
    method = 'GET',
    body,
    token,
  }: { method?: string; body?: unknown; token?: string } = {},
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${BASE_URL}${path}`, {
      method,
      headers: {
        Accept: 'application/json',
        ...(body !== undefined && { 'Content-Type': 'application/json' }),
        ...(token && { Authorization: `Bearer ${token}` }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      cache: 'no-store',
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    // Timeouts and connection failures say nothing about the session itself.
    throw new UserServiceError(503, 'User Service is unavailable.');
  }

  if (response.status === 204) return undefined as T;

  const data: unknown = await response.json().catch(() => null);
  if (!response.ok) throw parseError(response.status, data);
  return data as T;
}

export const userService = {
  createUser: ({
    nus_student_number,
    email,
    display_name,
    password,
  }: UserCreate) =>
    request<User>('/users', {
      method: 'POST',
      body: { nus_student_number, email, display_name, password },
    }),

  login: ({ nus_student_number, password }: Credentials) =>
    request<LoginResponse>('/login', {
      method: 'POST',
      body: { nus_student_number, password },
    }),

  logout: (token: string) =>
    request<void>('/logout', { method: 'POST', token }),

  getCurrentUser: (token: string) => request<User>('/users/me', { token }),

  // JSON.stringify drops the fields left undefined, so only changes are sent.
  updateCurrentUser: (
    token: string,
    { email, display_name, password }: UserUpdate,
  ) =>
    request<User>('/users/me', {
      method: 'PATCH',
      body: { email, display_name, password },
      token,
    }),

  deactivateCurrentUser: (token: string) =>
    request<User>('/users/me', { method: 'DELETE', token }),

  /** Accounts in any status, newest first. Administrators only. */
  listUsers: (
    token: string,
    { q, status, limit, offset }: UserListQuery = {},
  ) =>
    request<Page<User>>(
      withQuery('/admin/users', { q, status, limit, offset }),
      {
        token,
      },
    ),

  /** Any account's full profile, whatever its status. Administrators only. */
  getUser: (token: string, userId: string) =>
    request<User>(`/admin/users/${encodeURIComponent(userId)}`, { token }),

  /** Blocks the account and ends all of its sessions. */
  suspendUser: (token: string, userId: string) =>
    request<User>(`/admin/users/${encodeURIComponent(userId)}/suspend`, {
      method: 'POST',
      token,
    }),

  /** Restores a suspended account; it must log in again. */
  unsuspendUser: (token: string, userId: string) =>
    request<User>(`/admin/users/${encodeURIComponent(userId)}/unsuspend`, {
      method: 'POST',
      token,
    }),

  /** Makes another active user an administrator. */
  grantAdmin: (token: string, userId: string) =>
    request<User>(`/admin/users/${encodeURIComponent(userId)}/grant-admin`, {
      method: 'POST',
      token,
    }),

  /** Another user's public profile; User Service exposes the name only. */
  getDisplayName: async (token: string, userId: string) =>
    (
      await request<{ display_name: string }>(
        `/users/${encodeURIComponent(userId)}`,
        { token },
      )
    ).display_name,
};
