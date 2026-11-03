/**
 * AI Assistance Disclosure
 * Tool: Claude Code (Claude Opus 5)
 * Scope: Generated the admin user type and the calls the page makes.
 * Reviewed by Ngooi Jun Sen, removed unnecessary code that described user roles.
 *
 * The Admin Service endpoints from the API contract. Each one is validated
 * through the User Service on every request (Admin F2.1.1), and a non-admin
 * gets 404 rather than 403 (F2.2.1).
 */

import { api } from './api';

export type AdminAccountStatus = 'Created' | 'Verified' | 'Suspended';

/** A row of UI FR17's user table. */
export interface AdminUser {
  userId: string;
  name: string;
  email: string;
  status: AdminAccountStatus;
  isAdmin: boolean;
  /**
   * TODO(credit): the mockup shows a balance per user. Credit exposes
   * `/credit/me/balance` for the signed-in person only; nothing lets an
   * admin read someone else's, so this is absent from real responses.
   */
  credits?: number;
}

/** The User Service's search page size (ADMIN_SEARCH_PAGE_SIZE). */
export const ADMIN_USERS_PAGE_SIZE = 20;

export interface AdminUserPage {
  items: AdminUser[];
  page: number;
  hasMore: boolean;
  /** Full match count. The dashboard uses this for suspended users. */
  total: number;
}

/** One row as the Admin Service returns it, passed through from the User Service. */
interface UserSummary {
  id: string;
  name: string;
  email: string;
  role: 'admin' | 'user';
  status: AdminUser['status'];
}

/*
 * Recent searches, so retyping or backspacing to one is instant. Short-lived,
 * and emptied by every role or status change below, so a row never shows a
 * status this admin has just changed.
 */
const SEARCH_CACHE_MS = 30_000;
const searchCache = new Map<string, { at: number; result: AdminUserPage }>();

export function clearAdminUserCache(): void {
  searchCache.clear();
}

/**
 * `GET /api/v1/admin/users?search=&page=` (Admin F1, NFR1.1). The search
 * matches name, email, or an exact user ID.
 */
export async function fetchAdminUsers(
  search: string,
  page: number,
  status?: AdminAccountStatus,
): Promise<AdminUserPage> {
  const key = `${search.trim().toLowerCase()}|${page}|${status ?? ''}`;
  const cached = searchCache.get(key);
  if (cached !== undefined && Date.now() - cached.at < SEARCH_CACHE_MS) return cached.result;

  const params = new URLSearchParams({ page: String(page) });
  if (search.trim() !== '') params.set('search', search.trim());
  if (status) params.set('status', status);

  const result = await api.get<{ items: UserSummary[]; page: number; total: number }>(
    `/admin/users?${params.toString()}`,
  );
  const items = result.items.map((row) => ({
    userId: row.id,
    name: row.name,
    email: row.email,
    status: row.status,
    isAdmin: row.role === 'admin',
  }));
  const found = { items, page, total: result.total, hasMore: page * ADMIN_USERS_PAGE_SIZE < result.total };
  searchCache.set(key, { at: Date.now(), result: found });
  return found;
}

/**
 * Looks one user up by ID, through the same search. Null when no live account
 * has that ID, e.g. one deleted since it was reported.
 */
export async function fetchAdminUser(userId: string): Promise<AdminUser | null> {
  const { items } = await fetchAdminUsers(userId, 1);
  return items.find((user) => user.userId === userId.toLowerCase()) ?? null;
}

/** Admin F1.1. Admin calls the User Service to apply the role change. */
export async function promoteUser(userId: string): Promise<void> {
  await api.post(`/admin/users/${encodeURIComponent(userId)}/promote`);
  clearAdminUserCache();
}

/** Admin F1.2. Takes effect within 60 seconds (F1.2.1). */
export async function suspendUser(userId: string): Promise<void> {
  await api.post(`/admin/users/${encodeURIComponent(userId)}/suspend`);
  clearAdminUserCache();
}

/**
 * Admin F1.3. Logged (F1.3.2). The account returns to Verified, or to Created
 * if it never finished verifying; the page reloads the list to show which.
 */
export async function reinstateUser(userId: string): Promise<void> {
  await api.post(`/admin/users/${encodeURIComponent(userId)}/reinstate`);
  clearAdminUserCache();
}
