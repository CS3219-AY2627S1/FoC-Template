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

import { api } from './api';

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
}

export interface ConflictDetail extends ConflictSummary {
  comment: string;
  /**
   * Keys in Order's private photo bucket. The Admin Service reads them for the
   * AI; nothing serves them to a browser, so the page only counts them.
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

/**
 * Claims the case for this admin. Order then marks the order Under Review.
 * 409 when another admin claimed it first, or it is not ready to claim.
 */
export async function claimConflict(caseId: string): Promise<void> {
  await api.post(`/admin/conflicts/${encodeURIComponent(caseId)}/review`);
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
