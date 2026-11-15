/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (Claude Opus 5.5), date: 2026-10-16
 * Scope: Errand transition table as plain data, implementing the approved plan.
 * Author review: Reviewed and approved by @mattis.
 */
import type { ErrandState } from "./states";

export type Action =
  | "accept"
  | "withdraw"
  | "pickup"
  | "deliver"
  | "confirm"
  | "reject"
  | "cancel"
  | "resolveForCourier"
  | "resolveForRequester"
  | "expire"
  | "pickupTimeout"
  | "deliveryTimeout"
  | "confirmTimeout"
  | "reservationTimeout";

export type Party = "requester" | "courier" | "nonRequester" | "admin" | "system";

export type DeadlineColumn =
  | "reservation_deadline"
  | "listing_deadline"
  | "pickup_deadline"
  | "delivery_deadline"
  | "confirm_deadline";

export type TerminalEventType = "OrderCompleted" | "OrderCancelled" | "OrderExpired" | "OrderFailed";
export type ClosingMessageType = TerminalEventType | "ReservationTimedOut";

export interface TransitionRule {
  from: readonly ErrandState[];
  to: ErrandState;
  party: Party;
  deadline?: { column: DeadlineColumn; mustHavePassed: boolean };
  closingMessage?: ClosingMessageType;
  courier?: "assign" | "clear";
  stamp?: "accepted_at" | "picked_up_at" | "delivered_at";
}

// Entering DELIVERED also sets confirm_deadline (done by the repository, not encoded here).
// cancel from ACCEPTED leaves courier_id in place for history.
export const TRANSITIONS: Readonly<Record<Action, TransitionRule>> = {
  accept: {
    from: ["OPEN"], to: "ACCEPTED", party: "nonRequester",
    deadline: { column: "listing_deadline", mustHavePassed: false }, courier: "assign", stamp: "accepted_at",
  },
  withdraw: { from: ["ACCEPTED"], to: "OPEN", party: "courier", courier: "clear" },
  pickup: {
    from: ["ACCEPTED"], to: "PICKED_UP", party: "courier",
    deadline: { column: "pickup_deadline", mustHavePassed: false }, stamp: "picked_up_at",
  },
  deliver: {
    from: ["PICKED_UP"], to: "DELIVERED", party: "courier",
    deadline: { column: "delivery_deadline", mustHavePassed: false }, stamp: "delivered_at",
  },
  confirm: { from: ["DELIVERED"], to: "COMPLETED", party: "requester", closingMessage: "OrderCompleted" },
  reject: {
    from: ["DELIVERED"], to: "DISPUTED", party: "requester",
    deadline: { column: "confirm_deadline", mustHavePassed: false },
  },
  cancel: { from: ["OPEN", "ACCEPTED"], to: "CANCELLED", party: "requester", closingMessage: "OrderCancelled" },
  resolveForCourier: { from: ["DISPUTED"], to: "COMPLETED", party: "admin", closingMessage: "OrderCompleted" },
  resolveForRequester: { from: ["DISPUTED"], to: "FAILED", party: "admin", closingMessage: "OrderFailed" },
  expire: {
    from: ["OPEN"], to: "EXPIRED", party: "system",
    deadline: { column: "listing_deadline", mustHavePassed: true }, closingMessage: "OrderExpired",
  },
  pickupTimeout: {
    from: ["ACCEPTED"], to: "OPEN", party: "system",
    deadline: { column: "pickup_deadline", mustHavePassed: true }, courier: "clear",
  },
  deliveryTimeout: {
    from: ["PICKED_UP"], to: "DISPUTED", party: "system",
    deadline: { column: "delivery_deadline", mustHavePassed: true },
  },
  confirmTimeout: {
    from: ["DELIVERED"], to: "COMPLETED", party: "system",
    deadline: { column: "confirm_deadline", mustHavePassed: true }, closingMessage: "OrderCompleted",
  },
  reservationTimeout: {
    from: ["PENDING_RESERVATION"], to: "RESERVATION_TIMED_OUT", party: "system",
    deadline: { column: "reservation_deadline", mustHavePassed: true }, closingMessage: "ReservationTimedOut",
  },
};
