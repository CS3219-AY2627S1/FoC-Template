// AI Assistance Disclosure:
// Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-28, 2026-10-29, 2026-11-08,
// 2026-11-10
// Scope: Implemented the Admin Service client for disputes, reports, status changes and the
// audit log; added problems, statements and withdrawal for disputed errands.
// Author review: I validated correctness and supplied additional boundary checks.

import { requestJson } from "./client";
import type { FailureReason } from "./order-service";

// RESOLVED appears only on legacy disputes decided before disputed errands.
export type DisputeStatus = "OPEN" | "UNDER_REVIEW" | "ACCEPTED" | "REJECTED" | "WITHDRAWN" | "RESOLVED";
// WITHDRAWN belongs to the reporter (disputeReports.withdraw), never to administrators.
export type DisputeTarget = "UNDER_REVIEW" | "ACCEPTED" | "REJECTED";
export type ReporterRole = "REQUESTER" | "COURIER";

export type DisputeHistoryEntry = {
  sequence: number;
  fromStatus: DisputeStatus | null;
  toStatus: DisputeStatus;
  actorId: string;
  reason: string | null;
  occurredAt: string;
};

export type OwnStatement = { statementId: string; body: string; createdAt: string };
export type DisputeStatement = OwnStatement & { authorId: string; authorRole: ReporterRole };

export type DisputeSummary = {
  disputeId: string;
  orderId: string;
  // The problem the reporter selected; an accepted dispute fails the errand with it. Null only on
  // legacy disputes recorded before a problem had to be selected.
  problem: FailureReason | null;
  problemDetails: string | null;
  // A legacy dispute never held its errand; deciding it changes no errand.
  legacy: boolean;
  // Administrator case notes; null for participant reports.
  description: string | null;
  status: DisputeStatus;
  resolutionReason: string | null;
  // Null when an administrator recorded the dispute rather than an errand participant.
  reporterRole: ReporterRole | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  version: number;
};

export type Dispute = DisputeSummary & {
  evidenceRefs: string[];
  history: DisputeHistoryEntry[];
  statements: DisputeStatement[];
};

export type AuditEntry = {
  auditId: string;
  actorId: string;
  action:
    | "DISPUTE_CREATE"
    | "DISPUTE_REPORT"
    | "DISPUTE_TRANSITION"
    | "DISPUTE_WITHDRAW"
    | "DISPUTE_STATEMENT"
    | "ERRAND_DECISION";
  targetType: "DISPUTE" | "ORDER";
  targetId: string;
  outcome: "SUCCESS" | "REJECTED";
  errorCode: string | null;
  correlationId: string;
  occurredAt: string;
};

// What an errand participant sees: the problem, status and reasons, and only their own
// statements. Never the administrators, their notes or the history.
export type DisputeReport = Pick<
  DisputeSummary,
  "disputeId" | "orderId" | "problem" | "problemDetails" | "legacy" | "status" | "resolutionReason"
  | "reporterRole" | "createdAt" | "updatedAt" | "version"
> & { ownReport: boolean; statements: OwnStatement[] };

export type AdminPage<T> = { items: T[]; page: number; pageSize: number; total: number };
export type ProblemChoice = { problem: FailureReason; problemDetails: string | null };
export type NewDispute = ProblemChoice & { orderId: string; description: string; evidenceRefs: string[] };
export type NewReport = ProblemChoice & { orderId: string };
export type DisputeTransition = { toStatus: DisputeTarget; reason: string | null; expectedVersion: number };

// N2F3.3.1: OPEN -> UNDER_REVIEW -> ACCEPTED | REJECTED. Admin Service enforces this too.
export const NEXT_STATUSES: Record<DisputeStatus, DisputeTarget[]> = {
  OPEN: ["UNDER_REVIEW"],
  UNDER_REVIEW: ["ACCEPTED", "REJECTED"],
  ACCEPTED: [],
  REJECTED: [],
  WITHDRAWN: [],
  RESOLVED: [],
};

export const OPEN_DISPUTE: DisputeStatus[] = ["OPEN", "UNDER_REVIEW"];

function query(values: Record<string, string | number | undefined>): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) {
    if (value !== undefined && value !== "") params.set(key, String(value));
  }
  return params.size ? `?${params}` : "";
}

export const adminService = {
  // Reuse the same key and body after an ambiguous failure so a retry cannot duplicate a dispute.
  createDispute: (input: NewDispute, idempotencyKey: string, token: string) =>
    requestJson<Dispute>("/admin/disputes", {
      method: "POST",
      headers: { "Idempotency-Key": idempotencyKey },
      body: JSON.stringify(input),
    }, token),
  disputes: (filters: { page?: number; pageSize?: number; status?: DisputeStatus; orderId?: string }, token: string) =>
    requestJson<AdminPage<DisputeSummary>>(`/admin/disputes${query(filters)}`, { method: "GET" }, token),
  dispute: (disputeId: string, token: string) =>
    requestJson<Dispute>(`/admin/disputes/${encodeURIComponent(disputeId)}`, { method: "GET" }, token),
  transition: (disputeId: string, input: DisputeTransition, token: string) =>
    requestJson<Dispute>(`/admin/disputes/${encodeURIComponent(disputeId)}/transitions`, {
      method: "POST",
      body: JSON.stringify(input),
    }, token),
  auditLog: (filters: { page?: number; pageSize?: number }, token: string) =>
    requestJson<AdminPage<AuditEntry>>(`/admin/audit-log${query(filters)}`, { method: "GET" }, token),
};

// N2F3.2: requesters and couriers report problems with their own errands; administrators decide.
export const disputeReports = {
  report: (input: NewReport, idempotencyKey: string, token: string) =>
    requestJson<DisputeReport>("/disputes", {
      method: "POST",
      headers: { "Idempotency-Key": idempotencyKey },
      body: JSON.stringify(input),
    }, token),
  // With orderId: every dispute about that errand, for its requester or courier.
  list: (filters: { orderId?: string; page?: number; pageSize?: number }, token: string) =>
    requestJson<AdminPage<DisputeReport>>(`/disputes${query(filters)}`, { method: "GET" }, token),
  addStatement: (disputeId: string, body: string, idempotencyKey: string, token: string) =>
    requestJson<DisputeReport>(`/disputes/${encodeURIComponent(disputeId)}/statements`, {
      method: "POST",
      headers: { "Idempotency-Key": idempotencyKey },
      body: JSON.stringify({ body }),
    }, token),
  withdraw: (disputeId: string, reason: string, expectedVersion: number, token: string) =>
    requestJson<DisputeReport>(`/disputes/${encodeURIComponent(disputeId)}/withdraw`, {
      method: "POST",
      body: JSON.stringify({ reason, expectedVersion }),
    }, token),
};
