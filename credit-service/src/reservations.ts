/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (Claude Opus 5.5), date: 2026-10-16
 * Scope: Reserve, capture and release as decided in docs/decision-record.md (D2, D3, D5, D6,
 *        D8) and implementation-proposal.md §6.4 and §6.5.
 * Author review: Reviewed and approved by @phuc
 * Additional AI assistance: Claude Code (Claude Opus 5.5), date: 2026-10-18
 * Scope: ReservationTimedOut handled with the terminal events, per
 *        order-service/docs/order-credit-contract.md on feat/order-service-core.
 * Author review of additional changes: Reviewed and approved by @phuc
 */
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { forfeitIfDue, newForfeitOperationId, recordTransaction } from "./accounts";
import { CREDIT_RESULTS_TOPIC } from "./config";
import { inTransaction, isUniqueViolation, rollback, toAmount } from "./db";
import { ClosingMessage, ReserveRequested } from "./messages";
import { insertOutboxEvent } from "./outbox";

export type RejectionReason = "INSUFFICIENT_CREDIT" | "ACCOUNT_NOT_FOUND" | "ACCOUNT_NOT_ACTIVE" | "INVALID_AMOUNT";

/** A message for the caller to produce directly to Kafka (decision D5). */
export interface DirectMessage {
  topic: string;
  key: string;
  payload: Record<string, unknown>;
}

export type ReserveOutcome =
  // Committed; CreditReserved is in the outbox
  | { kind: "reserved"; reservationId: string }
  // Already processed, or this order already has a hold. Nothing to send
  | { kind: "duplicate" }
  // Nothing written. The caller produces `reply` (acks=all) before committing the offset
  | { kind: "rejected"; reason: RejectionReason; reply: DirectMessage };

/** CreditReservationRejected, decision D8 */
function rejection(msg: ReserveRequested, reason: RejectionReason): ReserveOutcome {
  return {
    kind: "rejected",
    reason,
    reply: {
      topic: CREDIT_RESULTS_TOPIC,
      key: msg.orderId,
      payload: {
        event_id: randomUUID(),
        type: "CreditReservationRejected",
        operation_id: msg.operationId,
        order_id: msg.orderId,
        reason_code: reason,
        occurred_at: new Date().toISOString(),
        schema_version: 1,
      },
    },
  };
}

/**
 * Handles ReserveRequested (CS-F2.1, decision D5). The balance check and the deduction are one
 * conditional UPDATE, so concurrent requests from one user cannot overdraw the account.
 */
export async function handleReserveRequested(pool: Pool, msg: ReserveRequested): Promise<ReserveOutcome> {
  if (msg.amount <= 0) return rejection(msg, "INVALID_AMOUNT");

  // 1. Already accepted?
  const seen = await pool.query("SELECT 1 FROM credit_transactions WHERE operation_id = $1 LIMIT 1", [msg.operationId]);
  if (seen.rows.length > 0) return { kind: "duplicate" };

  // 2-3. Check and deduct in one statement; on success record the hold and the reply
  const outcome = await inTransaction(pool, async (client): Promise<ReserveOutcome | null> => {
    const updated = await client.query(
      `UPDATE credit_accounts
       SET available_balance = available_balance - $2,
           reserved_balance  = reserved_balance  + $2,
           updated_at = now()
       WHERE user_id = $1 AND status = 'ACTIVE' AND available_balance >= $2
       RETURNING user_id`,
      [msg.requesterId, msg.amount],
    );
    if (updated.rowCount === 0) return rollback(null);

    const reservationId = randomUUID();
    try {
      await client.query(
        `INSERT INTO credit_reservations (reservation_id, order_id, requester_id, amount, status)
         VALUES ($1, $2, $3, $4, 'HELD')`,
        [reservationId, msg.orderId, msg.requesterId, msg.amount],
      );
      await recordTransaction(client, {
        userId: msg.requesterId,
        type: "RESERVE",
        availableDelta: -msg.amount,
        reservedDelta: msg.amount,
        operationId: msg.operationId,
        reservationId,
        orderId: msg.orderId,
      });
    } catch (err) {
      // order_id already has a hold, or a concurrent delivery of this operation won
      if (isUniqueViolation(err)) return rollback<ReserveOutcome>({ kind: "duplicate" });
      throw err;
    }
    await insertOutboxEvent(client, {
      eventType: "CreditReserved",
      topic: CREDIT_RESULTS_TOPIC,
      key: msg.orderId,
      causationId: msg.operationId,
      payload: {
        type: "CreditReserved",
        operation_id: msg.operationId,
        order_id: msg.orderId,
        reservation_id: reservationId,
        occurred_at: new Date().toISOString(),
        schema_version: 1,
      },
    });
    return { kind: "reserved", reservationId };
  });
  if (outcome) return outcome;

  // 0 rows: rejected. The UPDATE already decided; this read only picks the reason (D8)
  const { rows } = await pool.query("SELECT status FROM credit_accounts WHERE user_id = $1", [msg.requesterId]);
  if (rows.length === 0) return rejection(msg, "ACCOUNT_NOT_FOUND");
  if (rows[0].status !== "ACTIVE") return rejection(msg, "ACCOUNT_NOT_ACTIVE");
  return rejection(msg, "INSUFFICIENT_CREDIT");
}

export type ClosingOutcome =
  | { kind: "applied" }
  // ReservationTimedOut for an order with no hold (rejected, or never reserved). Nothing to do
  | { kind: "no_hold" }
  // This operation was already applied
  | { kind: "duplicate" }
  // Nothing changed; the caller sends the message to the DLQ (CS-F2.4, CS-F2.5)
  | { kind: "invalid"; reason: string };

const CLOSED_BY: Record<ClosingMessage["type"], string> = {
  OrderCompleted: "COMPLETED",
  OrderCancelled: "CANCELLED",
  OrderExpired: "EXPIRED",
  OrderFailed: "FAILED",
  ReservationTimedOut: "TIMED_OUT",
};

/**
 * Handles OrderCompleted (capture) and OrderCancelled / OrderExpired / OrderFailed /
 * ReservationTimedOut (release) in one transaction (CS-F2.2 to CS-F2.5, decision D6).
 * Processed whatever the account status (CS-F4.1.1).
 */
export async function handleClosingMessage(pool: Pool, msg: ClosingMessage): Promise<ClosingOutcome> {
  return inTransaction(pool, async (client): Promise<ClosingOutcome> => {
    const invalid = (reason: string) => rollback<ClosingOutcome>({ kind: "invalid", reason });

    // 1. Lock the reservation
    const { rows } = await client.query(
      `SELECT reservation_id, requester_id, amount, status, closed_by
       FROM credit_reservations WHERE order_id = $1 FOR UPDATE`,
      [msg.orderId],
    );
    const reservation = rows[0];
    if (!reservation) {
      // Order may time out a reserve that Credit rejected. Partition order guarantees the
      // ReserveRequested was handled first, so no hold can appear later (order-credit contract)
      if (msg.type === "ReservationTimedOut") return { kind: "no_hold" };
      return invalid("no reservation for order_id");
    }

    // 2. Already finalised: by this operation (duplicate) or by another one (conflict)
    if (reservation.status !== "HELD") {
      const same = await client.query("SELECT 1 FROM credit_transactions WHERE operation_id = $1 LIMIT 1", [
        msg.operationId,
      ]);
      if (same.rows.length > 0) return rollback<ClosingOutcome>({ kind: "duplicate" });
      return invalid(`reservation already ${reservation.status} (closed by ${reservation.closed_by})`);
    }

    // 3. Validate against the reservation (CS-F2.4, CS-F2.4.1)
    const amount = toAmount(reservation.amount);
    if (reservation.requester_id !== msg.requesterId) return invalid("requester_id does not match the reservation");
    if (amount !== msg.amount) return invalid("amount does not match the reservation");
    const capture = msg.type === "OrderCompleted";
    const courierId = msg.type === "OrderCompleted" ? msg.courierId : null;
    if (capture && (courierId === null || courierId === msg.requesterId)) {
      return invalid("OrderCompleted needs a courier_id different from requester_id");
    }

    // 4. Lock the affected accounts in ascending user_id order (CS-NFR3.2.1)
    const userIds = capture ? [msg.requesterId, courierId!] : [msg.requesterId];
    const locked = await client.query(
      "SELECT user_id FROM credit_accounts WHERE user_id = ANY($1::uuid[]) ORDER BY user_id FOR UPDATE",
      [userIds],
    );
    if (locked.rows.length !== userIds.length) return invalid("courier_id has no credit account");

    // 5. Move the credits and record one row per affected account (decision D3)
    const ref = { operationId: msg.operationId, reservationId: reservation.reservation_id, orderId: msg.orderId };
    if (capture) {
      await client.query(
        "UPDATE credit_accounts SET reserved_balance = reserved_balance - $2, updated_at = now() WHERE user_id = $1",
        [msg.requesterId, amount],
      );
      await client.query(
        "UPDATE credit_accounts SET available_balance = available_balance + $2, updated_at = now() WHERE user_id = $1",
        [courierId, amount],
      );
      await recordTransaction(client, { userId: msg.requesterId, type: "CAPTURE_DEBIT", availableDelta: 0, reservedDelta: -amount, ...ref });
      await recordTransaction(client, { userId: courierId!, type: "CAPTURE_CREDIT", availableDelta: amount, reservedDelta: 0, ...ref });
    } else {
      await client.query(
        `UPDATE credit_accounts
         SET reserved_balance = reserved_balance - $2, available_balance = available_balance + $2, updated_at = now()
         WHERE user_id = $1`,
        [msg.requesterId, amount],
      );
      await recordTransaction(client, { userId: msg.requesterId, type: "RELEASE", availableDelta: amount, reservedDelta: -amount, ...ref });
    }

    // 6. Finalise the reservation
    await client.query(
      `UPDATE credit_reservations
       SET status = $2, courier_id = $3, closed_by = $4, finalised_at = now()
       WHERE reservation_id = $1`,
      [reservation.reservation_id, capture ? "CAPTURED" : "RELEASED", capture ? courierId : null, CLOSED_BY[msg.type]],
    );

    // 7. A CLOSED requester whose last hold this was is forfeited now (decision D4). The
    // FORFEIT row needs its own operation_id: (operation_id, user_id) is already taken by
    // the requester's CAPTURE_DEBIT or RELEASE row.
    await forfeitIfDue(client, msg.requesterId, newForfeitOperationId(), {
      reservationId: reservation.reservation_id,
      orderId: msg.orderId,
    });
    return { kind: "applied" };
  });
}
