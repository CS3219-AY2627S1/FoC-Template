// AI Assistance Disclosure:
// Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-28, 2026-10-29, 2026-11-08,
// 2026-11-10
// Scope: Implemented Admin Dashboard labels, formatting, errors and drafts; added report helpers
// and disputed-errand labels.
// Author review: I validated correctness and supplied additional boundary checks.

import { isApiRequestError } from "../api/client";
import type { AuditEntry, DisputeStatus, DisputeSummary, ProblemChoice, ReporterRole } from "../api/admin-service";
import { failureReasons, type OrderState } from "../api/order-service";
import { orderError } from "./order-presentation";

export const LIVE_STATES: OrderState[] = ["OPEN", "ACCEPTED", "PICKED_UP", "DELIVERED", "DISPUTED"];
export const PAST_STATES: OrderState[] = ["COMPLETED", "CANCELLED", "EXPIRED", "FAILED"];
export const ALL_STATES: OrderState[] = [...LIVE_STATES, ...PAST_STATES];

export const disputeStatusLabels: Record<DisputeStatus, string> = {
  OPEN: "Open",
  UNDER_REVIEW: "Under review",
  ACCEPTED: "Accepted",
  REJECTED: "Rejected",
  WITHDRAWN: "Withdrawn",
  RESOLVED: "Resolved",
};

export const auditActionLabels: Record<AuditEntry["action"], string> = {
  DISPUTE_CREATE: "Record dispute",
  DISPUTE_REPORT: "Report problem",
  DISPUTE_TRANSITION: "Change dispute status",
  DISPUTE_WITHDRAW: "Withdraw dispute",
  DISPUTE_STATEMENT: "Send dispute details",
  ERRAND_DECISION: "Change errand for dispute",
};

/** The selected problem as both participants see it, e.g. "Other: courier never replied". */
export function problemLabel({ problem, problemDetails }: Omit<ProblemChoice, "problem"> & {
  problem: ProblemChoice["problem"] | null;
}): string {
  if (problem === null) return "Earlier report (no problem selected)";
  if (problem === "OTHER") return `Other: ${problemDetails ?? ""}`;
  return problemDetails ? `${failureReasons[problem]}: ${problemDetails}` : failureReasons[problem];
}

/** What each final dispute status did to the errand, for administrators and participants. */
export const disputeOutcomes: Partial<Record<DisputeStatus, string>> = {
  ACCEPTED: "The errand was marked as failed, so the reward returns to the requester.",
  REJECTED: "The errand continues from where it was before the dispute.",
  WITHDRAWN: "The errand continues from where it was before the dispute.",
};

// Legacy disputes were decided without holding the errand, so deciding them changed nothing.
export const LEGACY_OUTCOME = "Reported before errands paused for disputes, so the errand was not changed.";

/** What a closed dispute did to the errand, accounting for legacy disputes. */
export function disputeOutcome(dispute: { status: DisputeStatus; legacy: boolean }): string | null {
  if (dispute.legacy) return dispute.status === "OPEN" || dispute.status === "UNDER_REVIEW" ? null : LEGACY_OUTCOME;
  return disputeOutcomes[dispute.status] ?? null;
}

/** The label for a dispute's closing reason, which depends on who closed it. */
export function closingReasonLabel(status: DisputeStatus): string {
  return status === "WITHDRAWN" ? "Withdrawal reason" : "Decision";
}

const reporterLabels: Record<ReporterRole, string> = { REQUESTER: "Requester", COURIER: "Courier" };

/** Who raised a dispute: an errand participant's report or an administrator's record. */
export function disputeOrigin(dispute: Pick<DisputeSummary, "reporterRole">) {
  return dispute.reporterRole
    ? { verb: "Reported by", who: reporterLabels[dispute.reporterRole] }
    : { verb: "Recorded by", who: "Admin" };
}

export const stateLabel = (state: OrderState) => state.replaceAll("_", " ");

const singaporeDay = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Singapore" });
const singaporeClock = new Intl.DateTimeFormat("en-SG", {
  timeZone: "Asia/Singapore", hour: "2-digit", minute: "2-digit", hour12: false,
});
const calendarDay = new Intl.DateTimeFormat("en-SG", { timeZone: "UTC", day: "numeric", month: "short" });

/** Today's Asia/Singapore calendar date as YYYY-MM-DD, matching the analytics periods. */
export function singaporeToday(now = new Date()): string {
  return singaporeDay.format(now);
}

export function shiftDay(day: string, offset: number): string {
  const [year, month, date] = day.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, date + offset)).toISOString().slice(0, 10);
}

export function dayLabel(day: string): string {
  const [year, month, date] = day.split("-").map(Number);
  return calendarDay.format(new Date(Date.UTC(year, month - 1, date)));
}

// N2F4.2.2: a rate without errands is N/A, never 0%.
export function percent(rate: number | null): string {
  return rate === null ? "N/A" : `${Math.round(rate * 1000) / 10}%`;
}

export function duration(minutes: number | null): string {
  if (minutes === null) return "N/A";
  const whole = Math.round(minutes);
  return whole < 60 ? `${whole} min` : `${Math.floor(whole / 60)} h ${whole % 60} min`;
}

export function shortId(id: string | null | undefined): string {
  return id ? id.slice(0, 8).toUpperCase() : "—";
}

export function updatedAt(time: Date): string {
  return `Updated ${singaporeClock.format(time)} SGT`;
}

const messages: Record<string, string> = {
  VERSION_CONFLICT: "This dispute was changed by someone else. Refresh and review it before trying again.",
  INVALID_TRANSITION: "This status change is no longer allowed. Refresh to see the current status.",
  REASON_REQUIRED: "Give a reason to accept or reject this dispute.",
  ORDER_NOT_FOUND: "No errand has this ID.",
  ERRAND_CHANGED: "The errand no longer matches this dispute. Refresh and review it again.",
  DECISION_INCOMPLETE: "The errand was updated, but the dispute was not. Refresh and repeat the same decision to finish.",
  DISPUTE_ALREADY_OPEN: "A dispute about this errand is already open. Review that dispute instead.",
  REPORT_NOT_ALLOWED: "Disputes can be raised only while a courier is working on the errand.",
  ORDER_UNAVAILABLE: "Errand records are unavailable, so nothing was saved. Try again.",
  IDEMPOTENCY_KEY_REUSED: "This form was already used for a different dispute. Reload the page and try again.",
  DISPUTE_NOT_FOUND: "This dispute does not exist.",
  FORBIDDEN: "Administrator access is required. Your role may have changed.",
  VALIDATION_ERROR: "Check the filters and try again.",
  DATABASE_UNAVAILABLE: "This information is unavailable right now. Try again.",
  SERVICE_NOT_READY: "This information is unavailable right now. Try again.",
};

export function adminError(failure: unknown): string {
  if (isApiRequestError(failure) && messages[failure.code]) return messages[failure.code];
  if (isApiRequestError(failure) && failure.status === 404) return "This record was not found.";
  return orderError(failure);
}

export const isVersionConflict = (failure: unknown) =>
  isApiRequestError(failure) && failure.code === "VERSION_CONFLICT";

// Errors after which the administrator must see the current dispute and errand before retrying.
export const needsRefresh = (failure: unknown) =>
  isApiRequestError(failure)
  && ["VERSION_CONFLICT", "ERRAND_CHANGED", "DECISION_INCOMPLETE"].includes(failure.code);

// A missing credit reservation is a valid outcome to show, not a failure.
export function noReservation(failure: unknown): null {
  if (isApiRequestError(failure) && failure.code === "RESERVATION_NOT_FOUND") return null;
  throw failure;
}

// N2NFR4.6: unsaved dispute text survives retries and refreshes within this browser session.
export function readDraft<T>(key: string, fallback: T): T {
  try {
    const saved = sessionStorage.getItem(key);
    return saved === null ? fallback : (JSON.parse(saved) as T);
  } catch {
    return fallback;
  }
}

export function writeDraft(key: string, value: unknown) {
  try { sessionStorage.setItem(key, JSON.stringify(value)); } catch { /* storage is optional */ }
}

export function clearDraft(key: string) {
  try { sessionStorage.removeItem(key); } catch { /* storage is optional */ }
}
