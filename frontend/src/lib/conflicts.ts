/**
 * AI Assistance Disclosure
 * Tool: Claude Code (Claude Opus 5.5), date: 2026-11-02
 * Scope: Generated the Admin Service conflict case calls for the escalation
 *        review page.
 * Reviewed by Ngooi Jun Sen.
 *
 * A case opens when a requester escalates a delivery or a delivery deadline
 * passes (Order raises both). The Admin Service asks an AI model for a
 * verdict, then an admin claims the case and resolves it. A case left past its
 * deadline resolves itself on the AI's verdict, if that verdict is confident
 * enough.
 */

import { ApiError, UNAUTHORIZED_EVENT, api } from './api';
import { clearToken, getToken } from './session';

/**
 * created: waiting for the AI. ai_evaluated / ai_failed: ready to claim.
 * under_review: an admin has claimed it. resolved: done, by hand or by deadline.
 */
export type ConflictStatus = 'created' | 'ai_evaluated' | 'ai_failed' | 'under_review' | 'resolved';
export type FaultParty = 'requester' | 'courier' | 'no-fault';

export const FAULT_PARTIES: { value: FaultParty; label: string }[] = [
  { value: 'requester', label: 'Requester' },
  { value: 'courier', label: 'Courier' },
  { value: 'no-fault', label: 'No fault' },
];

export function faultLabel(party: FaultParty): string {
  return FAULT_PARTIES.find((option) => option.value === party)?.label ?? party;
}

/** One row of GET /admin/conflicts. */
export interface ConflictSummary {
  id: string;
  orderId: string;
  status: ConflictStatus;
  resolutionDeadline: string;
  aiFaultParty: FaultParty | null;
  /** 0 to 1. */
  aiConfidence: number | null;
  /**
   * When the Admin Service's reminder job fired (F3.7.1), 24 hours before the
   * deadline by default; null until then. Optional, as an older Admin Service
   * does not send it.
   */
  reminderSentAt?: string | null;
}

export interface ConflictDetail extends ConflictSummary {
  comment: string;
  /**
   * Keys in Order's private photo bucket (`{orderId}/collection.jpg` and the
   * same for delivery and dispute). The page asks the Admin Service for the
   * bytes; the keys themselves are not URLs.
   */
  evidencePhotoUrls: string[];
  aiReasoning: string | null;
  reporterUserId: string;
  createdAt: string;
  aiCompletedAt: string | null;
  reviewStartedAt: string | null;
  reviewStartedByAdminId: string | null;
  resolvedAt: string | null;
  resolvedFaultParty: FaultParty | null;
  resolvedByAdminId: string | null;
  resolvedAutomatically: boolean;
}

export async function fetchConflicts(): Promise<ConflictSummary[]> {
  return api.get<ConflictSummary[]>('/admin/conflicts');
}

export async function fetchConflict(caseId: string): Promise<ConflictDetail> {
  return api.get<ConflictDetail>(`/admin/conflicts/${encodeURIComponent(caseId)}`);
}

export const EVIDENCE_ROLES = ['collection', 'delivery', 'dispute'] as const;
export type EvidenceRole = (typeof EVIDENCE_ROLES)[number];

const ROLE_SET = new Set<string>(EVIDENCE_ROLES);

/** Roles actually stored on the case, in collection / delivery / dispute order. */
export function evidenceRoles(keys: string[]): EvidenceRole[] {
  const found = new Set<EvidenceRole>();
  for (const key of keys) {
    const name = key.trim().split('/').pop() ?? '';
    const stem = name.split('.')[0]?.toLowerCase() ?? '';
    if (ROLE_SET.has(stem)) found.add(stem as EvidenceRole);
  }
  return EVIDENCE_ROLES.filter((role) => found.has(role));
}

/** Image bytes for one role. 404 once the case is resolved or the object is gone. */
export async function fetchConflictPhoto(caseId: string, role: EvidenceRole): Promise<Blob> {
  const headers: Record<string, string> = {};
  const token = getToken();
  if (token !== null) headers.authorization = `Bearer ${token}`;

  const response = await fetch(
    `/api/v1/admin/conflicts/${encodeURIComponent(caseId)}/photos/${role}`,
    { headers, credentials: 'include' },
  );
  if (response.status === 401) {
    clearToken();
    window.dispatchEvent(new Event(UNAUTHORIZED_EVENT));
  }
  if (!response.ok) {
    throw new ApiError(response.status, 'UNKNOWN', 'Could not load this photo.');
  }
  return response.blob();
}

/**
 * Claims the case for this admin. Order then marks the order Under Review.
 * 409 when another admin claimed it first, or it is not ready to claim.
 */
export async function claimConflict(caseId: string): Promise<void> {
  await api.post(`/admin/conflicts/${encodeURIComponent(caseId)}/review`);
}

/**
 * Asks for a new AI verdict on a case this admin is reviewing. Returns as soon
 * as the job is queued; the page re-reads the case until `aiCompletedAt` changes.
 * 409 when this admin is not the one reviewing it.
 */
export async function reassessConflict(caseId: string): Promise<void> {
  await api.post(`/admin/conflicts/${encodeURIComponent(caseId)}/reassess`);
}

/**
 * Resolves a case this admin has claimed. The service also records whether
 * the admin agreed with the AI, so that is worked out here from the verdict.
 */
export async function resolveConflict(case_: ConflictDetail, faultParty: FaultParty): Promise<void> {
  await api.post(`/admin/conflicts/${encodeURIComponent(case_.id)}/resolve`, {
    faultParty,
    decision: case_.aiFaultParty === faultParty ? 'accept' : 'reject',
  });
}

/** Still needs someone: not yet resolved. */
export function isOpen(status: ConflictStatus): boolean {
  return status !== 'resolved';
}

/**
 * An open case whose deadline reminder has fired (F3.7.1): its deadline is
 * within a day. At the deadline it resolves on the AI's verdict if there is a
 * usable one; otherwise it stays open for an admin.
 */
export function isDueSoon(row: ConflictSummary): boolean {
  return isOpen(row.status) && row.reminderSentAt != null;
}
