/**
 * AI Assistance Disclosure
 * Tool: Claude Code (Claude Opus 5)
 * Scope: Generated the report and appeal types and the calls the admin queues
 *        and the user-facing report and appeal forms make.
 * Reviewed by Ngooi Jun Sen.
 *
 * Users file reports and appeals through the User Service, which checks who
 * they are and forwards to the Admin Service. The browser never calls the
 * Admin Service's intake endpoints (POST /admin/reports, POST /admin/appeals)
 * itself; admins only list and close.
 */

import { api } from './api';

/** Comment and message limit, as the User and Admin Services both enforce. */
export const SUPPORT_TEXT_MAX_LENGTH = 4000;

export interface UserReport {
  id: string;
  reporterUserId: string;
  reportedUserId: string;
  comment: string;
  /** Actioned: the reported user was suspended, which closes their open reports. */
  status: 'open' | 'dismissed' | 'actioned';
  createdAt: string;
  closedAt: string | null;
  closedByAdminId: string | null;
}

export interface SuspensionAppeal {
  id: string;
  userId: string;
  message: string;
  /** Reinstated: the user was reinstated, which closes their open appeal. */
  status: 'open' | 'rejected' | 'reinstated';
  rejectionReason: string | null;
  createdAt: string;
  closedAt: string | null;
  closedByAdminId: string | null;
}

/** Oldest first, as the Admin Service orders them. */
export async function fetchOpenReports(): Promise<UserReport[]> {
  return api.get<UserReport[]>('/admin/reports?status=open');
}

export async function fetchOpenAppeals(): Promise<SuspensionAppeal[]> {
  return api.get<SuspensionAppeal[]>('/admin/appeals?status=open');
}

/** Closes without suspending. 409 if the report was already closed. */
export async function dismissReport(reportId: string): Promise<void> {
  await api.post(`/admin/reports/${encodeURIComponent(reportId)}/dismiss`);
}

/** Leaves the suspension in place. The reason is stored and passed to User Service. 409 if already closed. */
export async function rejectAppeal(appealId: string, reason: string): Promise<void> {
  await api.post(`/admin/appeals/${encodeURIComponent(appealId)}/reject`, { reason });
}

/**
 * A signed-in user reports someone. A repeat while that pair has an open
 * report returns the existing one rather than a duplicate.
 *
 * 400 SELF_REPORT, INVALID_USER_ID or INVALID_SUPPORT_TEXT; 404 USER_NOT_FOUND.
 */
export async function reportUser(reportedUserId: string, comment: string): Promise<UserReport> {
  return api.post<UserReport>('/user/reports', { reportedUserId, comment });
}

/**
 * A suspended user asks to be reinstated. No session exists, so the password
 * proves who they are; it is sent once and never stored. A repeat while an
 * appeal is open returns that appeal.
 *
 * 401 INVALID_CREDENTIALS, 409 ACCOUNT_NOT_SUSPENDED, 429
 * TOO_MANY_APPEAL_ATTEMPTS, 400 INVALID_SUPPORT_TEXT.
 */
export async function submitAppeal(body: {
  email: string;
  password: string;
  message: string;
}): Promise<SuspensionAppeal> {
  return api.post<SuspensionAppeal>('/user/appeals', body);
}
