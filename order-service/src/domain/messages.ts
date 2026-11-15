/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (Claude Opus 5.5), date: 2026-10-16
 * Scope: Payload builders for the credit.commands messages, matching
 *        docs/order-credit-contract.md, implementing the approved plan.
 * Author review: Reviewed and approved by @mattis.
 */
import type { Errand } from "../errands/errand";
import type { ClosingMessageType, TerminalEventType } from "./transitions";

export function reserveRequestedPayload(e: Errand) {
  return {
    type: "ReserveRequested" as const,
    schema_version: 1 as const,
    operation_id: e.reservationOperationId,
    order_id: e.id,
    requester_id: e.requesterId,
    amount: e.creditAmount,
    occurred_at: e.createdAt.toISOString(),
  };
}

/** `courier_id` is the courier on OrderCompleted and null on the other three. */
export function terminalEventPayload(e: Errand, type: TerminalEventType, operationId: string) {
  if (type === "OrderCompleted" && e.courierId === null) {
    throw new Error(`OrderCompleted for errand ${e.id} has no courier`);
  }
  return {
    type,
    schema_version: 1 as const,
    operation_id: operationId,
    order_id: e.id,
    requester_id: e.requesterId,
    courier_id: type === "OrderCompleted" ? e.courierId : null,
    amount: e.creditAmount,
    occurred_at: e.updatedAt.toISOString(),
  };
}

/** No `courier_id` key: the errand never became visible to couriers. */
export function reservationTimedOutPayload(e: Errand, operationId: string) {
  return {
    type: "ReservationTimedOut" as const,
    schema_version: 1 as const,
    operation_id: operationId,
    order_id: e.id,
    requester_id: e.requesterId,
    amount: e.creditAmount,
    occurred_at: e.updatedAt.toISOString(),
  };
}

export function closingMessagePayload(e: Errand, type: ClosingMessageType, operationId: string) {
  return type === "ReservationTimedOut"
    ? reservationTimedOutPayload(e, operationId)
    : terminalEventPayload(e, type, operationId);
}

export type CreditResult =
  | { type: "CreditReserved"; eventId: string; operationId: string; orderId: string; reservationId: string }
  | { type: "CreditReservationRejected"; eventId: string; operationId: string; orderId: string; reasonCode: string };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Checks a Credit reply from credit.results. Never throws; UUIDs are lower-cased like Credit does. */
export function parseCreditResult(raw: unknown): { ok: true; message: CreditResult } | { ok: false; reason: string } {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return { ok: false, reason: "not a JSON object" };
  const body = raw as Record<string, unknown>;
  const bad = (reason: string) => ({ ok: false as const, reason });
  const uuid = (name: string): string | null => {
    const v = body[name];
    return typeof v === "string" && UUID_RE.test(v) ? v.toLowerCase() : null;
  };

  if (body.schema_version !== 1) return bad("unsupported schema_version");
  const eventId = uuid("event_id");
  if (eventId === null) return bad("event_id is not a UUID");
  const operationId = uuid("operation_id");
  if (operationId === null) return bad("operation_id is not a UUID");
  const orderId = uuid("order_id");
  if (orderId === null) return bad("order_id is not a UUID");
  if (typeof body.occurred_at !== "string" || Number.isNaN(Date.parse(body.occurred_at))) {
    return bad("occurred_at is not a timestamp");
  }

  if (body.type === "CreditReserved") {
    const reservationId = uuid("reservation_id");
    if (reservationId === null) return bad("reservation_id is not a UUID");
    return { ok: true, message: { type: "CreditReserved", eventId, operationId, orderId, reservationId } };
  }
  if (body.type === "CreditReservationRejected") {
    if (typeof body.reason_code !== "string" || body.reason_code === "") return bad("reason_code is missing");
    return {
      ok: true,
      message: { type: "CreditReservationRejected", eventId, operationId, orderId, reasonCode: body.reason_code },
    };
  }
  return bad("unknown type");
}
