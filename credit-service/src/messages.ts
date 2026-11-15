/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (Claude Opus 5.5), date: 2026-10-16
 * Scope: Validation of incoming message payloads, using the fields defined in
 *        implementation-proposal.md §5.2 and §6.2.
 * Author review: Reviewed and approved by @phuc
 * Additional AI assistance: Claude Code (Claude Opus 5.5), date: 2026-10-18
 * Scope: ReservationTimedOut, per order-service/docs/order-credit-contract.md on
 *        feat/order-service-core.
 * Author review of additional changes: Reviewed and approved by @phuc
 */

// Incoming messages arrive as parsed JSON from Kafka and are checked here before any
// handler touches the database. A message that fails these checks goes to the DLQ.

export type AccountStatus = "ACTIVE" | "SUSPENDED" | "CLOSED";

export interface AccountStatusNotification {
  operationId: string;
  accountId: string;
  newStatus: AccountStatus;
  firstActive: boolean;
}

export interface ReserveRequested {
  type: "ReserveRequested";
  operationId: string;
  orderId: string;
  requesterId: string;
  // May be <= 0: that is a business rejection (INVALID_AMOUNT), not a malformed message
  amount: number;
}

export type TerminalEventType = "OrderCompleted" | "OrderCancelled" | "OrderExpired" | "OrderFailed";

export interface TerminalEvent {
  type: TerminalEventType;
  operationId: string;
  orderId: string;
  requesterId: string;
  // Present only on OrderCompleted
  courierId: string | null;
  amount: number;
}

// Order gave up waiting for a reply to its ReserveRequested. Releases the hold if one exists;
// otherwise nothing happens (order-credit contract)
export interface ReservationTimedOut {
  type: "ReservationTimedOut";
  operationId: string;
  orderId: string;
  requesterId: string;
  amount: number;
}

// The messages that finalise a hold
export type ClosingMessage = TerminalEvent | ReservationTimedOut;

export type CreditCommand = ReserveRequested | ClosingMessage;

export type Parsed<T> = { ok: true; message: T } | { ok: false; reason: string };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TERMINAL_TYPES: readonly string[] = ["OrderCompleted", "OrderCancelled", "OrderExpired", "OrderFailed"];
const STATUSES: readonly string[] = ["ACTIVE", "SUSPENDED", "CLOSED"];

class Invalid extends Error {}

function field(body: Record<string, unknown>, name: string): unknown {
  if (!(name in body)) throw new Invalid(`missing ${name}`);
  return body[name];
}

// UUIDs are compared as text later, so they are lower-cased here
function uuid(body: Record<string, unknown>, name: string): string {
  const value = field(body, name);
  if (typeof value !== "string" || !UUID_RE.test(value)) throw new Invalid(`${name} is not a UUID`);
  return value.toLowerCase();
}

function wholeNumber(body: Record<string, unknown>, name: string): number {
  const value = field(body, name);
  if (typeof value !== "number" || !Number.isSafeInteger(value)) throw new Invalid(`${name} is not a whole number`);
  return value;
}

function parse<T>(raw: unknown, read: (body: Record<string, unknown>) => T): Parsed<T> {
  try {
    if (typeof raw !== "object" || raw === null || Array.isArray(raw)) throw new Invalid("not a JSON object");
    const body = raw as Record<string, unknown>;
    if (field(body, "schema_version") !== 1) throw new Invalid("unsupported schema_version");
    return { ok: true, message: read(body) };
  } catch (err) {
    if (err instanceof Invalid) return { ok: false, reason: err.message };
    throw err;
  }
}

/** A message from user.account-status (US-F9.3). */
export function parseAccountStatusNotification(raw: unknown): Parsed<AccountStatusNotification> {
  return parse(raw, (body) => {
    const newStatus = field(body, "new_status");
    if (typeof newStatus !== "string" || !STATUSES.includes(newStatus)) throw new Invalid("unknown new_status");
    const firstActive = field(body, "first_active");
    if (typeof firstActive !== "boolean") throw new Invalid("first_active is not a boolean");
    if (firstActive && newStatus !== "ACTIVE") throw new Invalid("first_active is true but new_status is not ACTIVE");
    return {
      operationId: uuid(body, "operation_id"),
      accountId: uuid(body, "account_id"),
      newStatus: newStatus as AccountStatus,
      firstActive,
    };
  });
}

/**
 * A message from credit.commands: ReserveRequested, one of the four terminal events, or
 * ReservationTimedOut.
 */
export function parseCreditCommand(raw: unknown): Parsed<CreditCommand> {
  return parse(raw, (body): CreditCommand => {
    const type = field(body, "type");
    if (type === "ReserveRequested" || type === "ReservationTimedOut") {
      return {
        type,
        operationId: uuid(body, "operation_id"),
        orderId: uuid(body, "order_id"),
        requesterId: uuid(body, "requester_id"),
        amount: wholeNumber(body, "amount"),
      };
    }
    if (typeof type === "string" && TERMINAL_TYPES.includes(type)) {
      const event: TerminalEvent = {
        type: type as TerminalEventType,
        operationId: uuid(body, "operation_id"),
        orderId: uuid(body, "order_id"),
        requesterId: uuid(body, "requester_id"),
        courierId: type === "OrderCompleted" ? uuid(body, "courier_id") : null,
        amount: wholeNumber(body, "amount"),
      };
      if (event.courierId !== null && event.courierId === event.requesterId) {
        throw new Invalid("courier_id equals requester_id");
      }
      return event;
    }
    throw new Invalid("unknown type");
  });
}
