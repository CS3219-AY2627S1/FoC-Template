// AI Assistance Disclosure:
// Tool: Claude Code (model: claude-opus-5), date: 2026-09-26
//  2026-09-26: Recess iteration - queries for balances and transaction_log.
//    Column names and the write-path effects follow credit-service-context.md §5;
//    the transaction_log fields follow F20.1.1.
//    No requirements, architecture, schema, or API decisions were made by the AI tool.
//    Author review: Wee Jean
//  2026-10-16: Week 7/8 catch-up - queries for transfer (F19.3.1), release (F19.4.1)
//    and balance read (F19.5.1), following the write-path table in context §5.
//    No requirements, architecture, schema, or API decisions were made by the AI tool.
//    Author review: Reviewed and verified by Koh Wee Jean, 2026-11-10.
//  2026-11-04: Admin filters - listTransactions takes a TransactionFilters object so the
//    administrator view can narrow by user or by order. No schema change.
//    No requirements, architecture, schema, or API decisions were made by the AI tool.
//    Author review: Reviewed and verified by Koh Wee Jean, 2026-11-10.

import type pg from 'pg';
import type { Queryable } from '../transaction.js';

/** Postgres SQLSTATE codes we handle by name rather than by message text. */
export const PG_UNIQUE_VIOLATION = '23505';
export const PG_CHECK_VIOLATION = '23514';

export interface BalanceRow {
  user_id: string;
  total_balance: number;
  reserved_balance: number;
}

export type TransactionType = 'allocation' | 'reservation' | 'transfer' | 'release';

export interface TransactionRow {
  transaction_id: string;
  transaction_type: TransactionType;
  originating_user_id: string | null;
  destination_user_id: string | null;
  amount: number;
  created_at: Date;
  request_id: string | null;
}

const BALANCE_COLUMNS = 'user_id, total_balance, reserved_balance';

/**
 * Creates the user's balance row with their starting credits (F19.1.1).
 *
 * Returns null when the row already existed. The PRIMARY KEY on user_id makes this the
 * race-safe way to answer "is this the first allocation?" - two concurrent calls both
 * reach the INSERT, exactly one gets a row back, and the loser is told the credits were
 * already allocated rather than writing a second log entry.
 */
export async function insertInitialBalance(
  client: pg.PoolClient,
  userId: string,
  credits: number,
): Promise<BalanceRow | null> {
  const { rows } = await client.query<BalanceRow>(
    `INSERT INTO balances (user_id, total_balance, reserved_balance)
     VALUES ($1, $2, 0)
     ON CONFLICT (user_id) DO NOTHING
     RETURNING ${BALANCE_COLUMNS}`,
    [userId, credits],
  );
  return rows[0] ?? null;
}

/**
 * Reads a balance and holds a row lock until the surrounding transaction ends.
 *
 * `FOR UPDATE` is what satisfies NFR8.1.1: concurrent reservations for the same user
 * queue behind each other instead of both reading the same stale unreserved figure.
 * context §4 is explicit that atomicity comes from Postgres, never from assumptions
 * about Node's event loop.
 */
export async function lockBalanceForUpdate(
  client: pg.PoolClient,
  userId: string,
): Promise<BalanceRow | null> {
  const { rows } = await client.query<BalanceRow>(
    `SELECT ${BALANCE_COLUMNS} FROM balances WHERE user_id = $1 FOR UPDATE`,
    [userId],
  );
  return rows[0] ?? null;
}

/** Reservation write path (context §5): total unchanged, reserved + amount. */
export async function increaseReservedBalance(
  client: pg.PoolClient,
  userId: string,
  amount: number,
): Promise<BalanceRow> {
  const { rows } = await client.query<BalanceRow>(
    `UPDATE balances
        SET reserved_balance = reserved_balance + $2,
            updated_at = NOW()
      WHERE user_id = $1
      RETURNING ${BALANCE_COLUMNS}`,
    [userId, amount],
  );
  const row = rows[0];
  if (!row) {
    // Unreachable: callers lock the row first, so it exists for the whole transaction.
    throw new Error(`increaseReservedBalance: no balance row for user ${userId}`);
  }
  return row;
}

/**
 * The reservation a transfer or release acts on, found by request id.
 *
 * Amount and requester are read back from the log rather than taken from the caller:
 * the reservation row is the only record of what was actually held, so deriving from it
 * makes it impossible for a transfer to move a different figure than was reserved.
 */
export async function findReservation(
  client: pg.PoolClient,
  requestId: string,
): Promise<{ requesterId: string; amount: number } | null> {
  const { rows } = await client.query<{ originating_user_id: string; amount: number }>(
    `SELECT originating_user_id, amount
       FROM transaction_log
      WHERE request_id = $1 AND transaction_type = 'reservation'`,
    [requestId],
  );
  const row = rows[0];
  return row ? { requesterId: row.originating_user_id, amount: row.amount } : null;
}

/** True when this request already has a log row of the given type. */
export async function hasTransactionOfType(
  client: pg.PoolClient,
  requestId: string,
  type: TransactionType,
): Promise<boolean> {
  const { rows } = await client.query(
    `SELECT 1 FROM transaction_log WHERE request_id = $1 AND transaction_type = $2`,
    [requestId, type],
  );
  return rows.length > 0;
}

/**
 * Locks two balance rows in one transaction, always in the same order.
 *
 * Ordering by user id is what stops two transfers running in opposite directions from
 * deadlocking: both transactions take the lower id first, so one simply waits.
 * Returns null if either row is missing, so the caller can tell the two cases apart.
 */
export async function lockTwoBalancesForUpdate(
  client: pg.PoolClient,
  userIdA: string,
  userIdB: string,
): Promise<Map<string, BalanceRow>> {
  const ids = userIdA === userIdB ? [userIdA] : [userIdA, userIdB].sort();
  const { rows } = await client.query<BalanceRow>(
    `SELECT ${BALANCE_COLUMNS} FROM balances
      WHERE user_id = ANY($1::uuid[])
      ORDER BY user_id
        FOR UPDATE`,
    [ids],
  );
  return new Map(rows.map((r) => [r.user_id, r]));
}

/** Transfer, requester side (context §5): total and reserved both fall by amount. */
export async function debitRequesterForTransfer(
  client: pg.PoolClient,
  userId: string,
  amount: number,
): Promise<BalanceRow> {
  const { rows } = await client.query<BalanceRow>(
    `UPDATE balances
        SET total_balance = total_balance - $2,
            reserved_balance = reserved_balance - $2,
            updated_at = NOW()
      WHERE user_id = $1
      RETURNING ${BALANCE_COLUMNS}`,
    [userId, amount],
  );
  const row = rows[0];
  if (!row) throw new Error(`debitRequesterForTransfer: no balance row for ${userId}`);
  return row;
}

/** Transfer, courier side (context §5): total rises by amount, reserved untouched. */
export async function creditCourierForTransfer(
  client: pg.PoolClient,
  userId: string,
  amount: number,
): Promise<BalanceRow> {
  const { rows } = await client.query<BalanceRow>(
    `UPDATE balances
        SET total_balance = total_balance + $2,
            updated_at = NOW()
      WHERE user_id = $1
      RETURNING ${BALANCE_COLUMNS}`,
    [userId, amount],
  );
  const row = rows[0];
  if (!row) throw new Error(`creditCourierForTransfer: no balance row for ${userId}`);
  return row;
}

/** Release (context §5): reserved falls by amount, total is untouched. */
export async function decreaseReservedBalance(
  client: pg.PoolClient,
  userId: string,
  amount: number,
): Promise<BalanceRow> {
  const { rows } = await client.query<BalanceRow>(
    `UPDATE balances
        SET reserved_balance = reserved_balance - $2,
            updated_at = NOW()
      WHERE user_id = $1
      RETURNING ${BALANCE_COLUMNS}`,
    [userId, amount],
  );
  const row = rows[0];
  if (!row) throw new Error(`decreaseReservedBalance: no balance row for ${userId}`);
  return row;
}

/** F19.5.1 - read a balance without locking it. */
export async function readBalance(
  client: Queryable,
  userId: string,
): Promise<BalanceRow | null> {
  const { rows } = await client.query<BalanceRow>(
    `SELECT ${BALANCE_COLUMNS} FROM balances WHERE user_id = $1`,
    [userId],
  );
  return rows[0] ?? null;
}

export interface TransactionEntry {
  transactionType: TransactionType;
  originatingUserId: string | null;
  destinationUserId: string | null;
  amount: number;
  requestId: string | null;
}

/**
 * Appends one row to the transaction log (F20.1.1).
 *
 * Always called on the same client, inside the same transaction, as the balance write
 * it describes (context §5). transaction_id and created_at are database defaults, so the
 * log's identity and timestamp do not depend on application clocks.
 */
export async function insertTransaction(
  client: pg.PoolClient,
  entry: TransactionEntry,
): Promise<TransactionRow> {
  const { rows } = await client.query<TransactionRow>(
    `INSERT INTO transaction_log
       (transaction_type, originating_user_id, destination_user_id, amount, request_id)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING transaction_id, transaction_type, originating_user_id,
               destination_user_id, amount, created_at, request_id`,
    [
      entry.transactionType,
      entry.originatingUserId,
      entry.destinationUserId,
      entry.amount,
      entry.requestId,
    ],
  );
  const row = rows[0];
  if (!row) {
    throw new Error('insertTransaction: INSERT ... RETURNING produced no row');
  }
  return row;
}

/** True when `err` is a Postgres error carrying the given SQLSTATE. */
export function isPgError(err: unknown, code: string): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    (err as { code?: unknown }).code === code
  );
}

/** The constraint name Postgres reports, if the error carries one. */
export function pgConstraint(err: unknown): string | undefined {
  if (typeof err === 'object' && err !== null && 'constraint' in err) {
    const value = (err as { constraint?: unknown }).constraint;
    return typeof value === 'string' ? value : undefined;
  }
  return undefined;
}

export const TRANSACTION_PAGE_SIZE = 20;

const TRANSACTION_COLUMNS = `transaction_id, transaction_type, originating_user_id,
       destination_user_id, amount, created_at, request_id`;

export interface TransactionCursor {
  createdAt: string;
  transactionId: string;
}

/**
 * Which rows a page covers.
 *
 * `userId` does double duty: for F19.5.2 it is the caller's own scope, and for the
 * administrator view it is an optional filter. The predicate is identical either way —
 * rows where that user is the originating OR the destination party — so both go through
 * one code path rather than two that could drift.
 *
 * `requestId` narrows to a single order. Null or undefined means "no constraint".
 */
export interface TransactionFilters {
  userId?: string | null;
  requestId?: string | null;
}

/**
 * One page of the log, newest first.
 *
 * Keyset pagination on (created_at, transaction_id): the cursor names the last row of
 * the previous page and the next page starts strictly after it. The log is append-only
 * and grows at the head, so OFFSET would shift rows between requests and a reader
 * paging backwards through history would see duplicates. The tie-break on
 * transaction_id keeps the order total when two rows share a timestamp.
 *
 * With no filters this returns every user's rows (F20.2). `filters.userId` restricts to
 * rows where that user is the originating or destination party — the caller's own scope
 * for F19.5.2, an administrator's filter on the all-transactions view. `filters.requestId`
 * restricts to one order. Supplying both ANDs them.
 *
 * Filters are not encoded in the cursor: the caller re-sends them alongside ?cursor= on
 * each request, so the cursor stays a pure position token and cannot disagree with the
 * filter it was issued under.
 *
 * Fetches one row more than the page size so the caller can tell whether another page
 * exists without a second COUNT query.
 */
export async function listTransactions(
  client: Queryable,
  filters: TransactionFilters,
  cursor: TransactionCursor | null,
  limit: number = TRANSACTION_PAGE_SIZE,
): Promise<TransactionRow[]> {
  const conditions: string[] = [];
  const params: unknown[] = [];

  if (filters.userId) {
    params.push(filters.userId);
    conditions.push(`(originating_user_id = $${params.length} OR destination_user_id = $${params.length})`);
  }
  if (filters.requestId) {
    params.push(filters.requestId);
    conditions.push(`request_id = $${params.length}`);
  }
  if (cursor) {
    params.push(cursor.createdAt, cursor.transactionId);
    conditions.push(`(created_at, transaction_id) < ($${params.length - 1}, $${params.length})`);
  }
  params.push(limit + 1);

  const { rows } = await client.query<TransactionRow>(
    `SELECT ${TRANSACTION_COLUMNS}
       FROM transaction_log
      ${conditions.length ? 'WHERE ' + conditions.join(' AND ') : ''}
      ORDER BY created_at DESC, transaction_id DESC
      LIMIT $${params.length}`,
    params,
  );
  return rows;
}
