// Additional AI assistance: Codex (GPT-6), 2026-10-18. Scope: account-status publishing and verification. Author review: Reviewed and approved by @phuc.
/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (Claude Opus 5.5), date: 2026-10-16
 * Scope: Account-status handling, initial grant and forfeiture as decided in
 *        docs/decision-record.md (D3, D4, D6) and implementation-proposal.md §5.4; the
 *        balance read for CS-F1.2.
 * Author review: Reviewed and approved by @phuc
 */
import { randomUUID } from "node:crypto";
import { Pool, PoolClient } from "pg";
import { loadCreditConfig } from "./config";
import { inTransaction, rollback, toAmount } from "./db";
import { AccountStatusNotification } from "./messages";

export type TransactionType =
  | "INITIAL_GRANT"
  | "RESERVE"
  | "CAPTURE_DEBIT"
  | "CAPTURE_CREDIT"
  | "RELEASE"
  | "FORFEIT";

/** Inserts one credit_transactions row. Call it in the transaction that changes the balance. */
export async function recordTransaction(
  client: PoolClient,
  row: {
    userId: string;
    type: TransactionType;
    availableDelta: number;
    reservedDelta: number;
    operationId: string;
    reservationId?: string;
    orderId?: string;
  },
): Promise<void> {
  await client.query(
    `INSERT INTO credit_transactions
       (user_id, type, available_delta, reserved_delta, reservation_id, order_id, operation_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [row.userId, row.type, row.availableDelta, row.reservedDelta, row.reservationId ?? null, row.orderId ?? null, row.operationId],
  );
}

/**
 * Forfeits a CLOSED account's balance if nothing is reserved and it has not been forfeited
 * yet (CS-F4.2, decision D4). Locks the account row. Returns true if it forfeited.
 *
 * `operationId` must not already be used for this user in credit_transactions.
 */
export async function forfeitIfDue(
  client: PoolClient,
  userId: string,
  operationId: string,
  ref: { reservationId?: string; orderId?: string } = {},
): Promise<boolean> {
  const { rows } = await client.query(
    `SELECT status, available_balance, reserved_balance, forfeited_at
     FROM credit_accounts WHERE user_id = $1 FOR UPDATE`,
    [userId],
  );
  const account = rows[0];
  if (!account || account.status !== "CLOSED" || account.forfeited_at !== null || toAmount(account.reserved_balance) !== 0) {
    return false;
  }
  const available = toAmount(account.available_balance);
  await client.query(
    `UPDATE credit_accounts
     SET available_balance = 0, forfeited_at = now(), updated_at = now()
     WHERE user_id = $1`,
    [userId],
  );
  // Written even when the balance is already 0, so the history shows the forfeit
  await recordTransaction(client, {
    userId,
    type: "FORFEIT",
    availableDelta: -available,
    reservedDelta: 0,
    operationId,
    ...ref,
  });
  return true;
}

export type AccountStatusOutcome =
  | { kind: "applied" }
  // Already processed: the account was granted before (decision D6)
  | { kind: "duplicate" }
  // Not applied; the caller sends the message to the DLQ
  | { kind: "invalid"; reason: string };

/**
 * Handles one user.account-status notification in one transaction (implementation-proposal
 * §5.4). Safe to call again with the same message.
 */
export async function handleAccountStatus(
  pool: Pool,
  msg: AccountStatusNotification,
): Promise<AccountStatusOutcome> {
  return inTransaction(pool, async (client): Promise<AccountStatusOutcome> => {
    // Atomic with the effects below. In particular, replayed restores must not undo suspensions.
    const marker = await client.query(
      "INSERT INTO processed_account_status (operation_id) VALUES ($1) ON CONFLICT DO NOTHING",
      [msg.operationId],
    );
    if (marker.rowCount === 0) return { kind: "duplicate" };
    if (msg.newStatus === "ACTIVE" && msg.firstActive) {
      const grant = loadCreditConfig().initialCreditGrant;
      const inserted = await client.query(
        `INSERT INTO credit_accounts (user_id, status, available_balance)
         VALUES ($1, 'ACTIVE', $2)
         ON CONFLICT (user_id) DO NOTHING`,
        [msg.accountId, grant],
      );
      // The grant row is written only if this call created the account (CS-F1.1.1)
      if (inserted.rowCount === 0) return { kind: "duplicate" };
      await recordTransaction(client, {
        userId: msg.accountId,
        type: "INITIAL_GRANT",
        availableDelta: grant,
        reservedDelta: 0,
        operationId: msg.operationId,
      });
      return { kind: "applied" };
    }

    const { rows } = await client.query("SELECT status FROM credit_accounts WHERE user_id = $1 FOR UPDATE", [
      msg.accountId,
    ]);
    if (rows.length === 0) {
      return rollback<AccountStatusOutcome>({ kind: "invalid", reason: "no credit account for account_id" });
    }
    // CLOSED is final: the balance may already be forfeited
    if (rows[0].status === "CLOSED" && msg.newStatus !== "CLOSED") {
      return rollback<AccountStatusOutcome>({ kind: "invalid", reason: `account is CLOSED; cannot change to ${msg.newStatus}` });
    }

    // Setting a status is idempotent, so a redelivered notification changes nothing new
    await client.query("UPDATE credit_accounts SET status = $2, updated_at = now() WHERE user_id = $1", [
      msg.accountId,
      msg.newStatus,
    ]);
    if (msg.newStatus === "CLOSED") {
      // Forfeits now if nothing is reserved; otherwise the last release/capture does it
      await forfeitIfDue(client, msg.accountId, msg.operationId);
    }
    return { kind: "applied" };
  });
}

export interface Balance {
  total: number;
  reserved: number;
  available: number;
}

/** The user's own balance, read in one statement (CS-F1.2). Null if they have no account. */
export async function getBalance(pool: Pool, userId: string): Promise<Balance | null> {
  const { rows } = await pool.query(
    "SELECT available_balance, reserved_balance FROM credit_accounts WHERE user_id = $1",
    [userId],
  );
  if (rows.length === 0) return null;
  const available = toAmount(rows[0].available_balance);
  const reserved = toAmount(rows[0].reserved_balance);
  return { total: available + reserved, reserved, available };
}

/** A fresh operation_id for a FORFEIT row that is triggered by another operation. */
export function newForfeitOperationId(): string {
  return randomUUID();
}
