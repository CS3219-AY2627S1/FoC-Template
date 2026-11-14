// AI Assistance Disclosure:
// Tool: Claude Code (model: claude-opus-5), date: 2026-09-26
//  2026-09-26: Recess iteration - allocation (F19.1.1) and reservation (F19.2.1-F19.2.3),
//    each wrapped in one database transaction that writes balances and transaction_log
//    together (NFR8.1.1, F20.1.1, context §5).
//    The error `code` strings and the HTTP statuses they map to are NOT team-decided;
//    they are pending sign-off - see credit-service/README.md.
//    Author review: Wee Jean
//  2026-10-19: Week 9 - transaction history for F19.5.2 and F20.2, keyset-paginated.
//    No requirements, architecture, schema, or API decisions were made by the AI tool.
//    Author review: Reviewed and verified by Koh Wee Jean, 2026-11-10.
//  2026-11-04: Admin filters - getAllTransactions accepts optional userId / requestId
//    filters. No new route, no new fields; see credit-service-context.md §10 item 10 for
//    the missing requirement behind this surface.
//    No requirements, architecture, schema, or API decisions were made by the AI tool.
//    Author review: Reviewed and verified by Koh Wee Jean, 2026-11-10.

import { INITIAL_ALLOCATION_CREDITS } from '../domain/constants.js';
import { withTransaction } from '../db/transaction.js';
import { AppError } from '../utils/AppError.js';
import pool from '../db/pool.js';
import {
  PG_UNIQUE_VIOLATION,
  creditCourierForTransfer,
  debitRequesterForTransfer,
  decreaseReservedBalance,
  findReservation,
  hasTransactionOfType,
  increaseReservedBalance,
  insertInitialBalance,
  insertTransaction,
  isPgError,
  lockBalanceForUpdate,
  listTransactions,
  lockTwoBalancesForUpdate,
  pgConstraint,
  readBalance,
  TRANSACTION_PAGE_SIZE,
  type BalanceRow,
  type TransactionCursor,
  type TransactionFilters,
  type TransactionRow,
} from '../db/queries/credits.queries.js';

export interface BalanceView {
  userId: string;
  totalBalance: number;
  reservedBalance: number;
  /** Derived, never stored (context §5). */
  unreservedBalance: number;
}

export interface CreditOperationResult {
  balance: BalanceView;
  transaction: TransactionRow;
}

function toBalanceView(row: BalanceRow): BalanceView {
  return {
    userId: row.user_id,
    totalBalance: row.total_balance,
    reservedBalance: row.reserved_balance,
    unreservedBalance: row.total_balance - row.reserved_balance,
  };
}

/**
 * F19.1.1 - allocate the starting credits to a newly registered user.
 *
 * One transaction: create the balance row, then log the allocation. If either statement
 * fails the other is rolled back, so a user can never end up with credits that were
 * never logged, or a logged allocation that granted nothing.
 */
export async function allocateInitialCredits(userId: string): Promise<CreditOperationResult> {
  return withTransaction(async (client) => {
    const balance = await insertInitialBalance(client, userId, INITIAL_ALLOCATION_CREDITS);

    if (!balance) {
      // The row already existed. Registration is a once-per-user event, so this is a
      // repeated trigger rather than a second entitlement: no credits, no log entry.
      throw new AppError(
        409,
        'Credits have already been allocated to this user.',
        'ALREADY_ALLOCATED',
      );
    }

    const transaction = await insertTransaction(client, {
      transactionType: 'allocation',
      // Team decision 2026-09-26: an allocation names the new user as destination.
      originatingUserId: null,
      destinationUserId: userId,
      amount: INITIAL_ALLOCATION_CREDITS,
      requestId: null,
    });

    return { balance: toBalanceView(balance), transaction };
  });
}

/**
 * F19.2.1 - reserve the offered credits when a request is created.
 * F19.2.3 - reject when the offer exceeds the requester's unreserved balance.
 *
 * One transaction: lock the balance row, check unreserved against the offer, move the
 * credits into reserved, then log the reservation. The `FOR UPDATE` lock is what makes
 * two simultaneous reservations for the same user safe (NFR8.1.1) - the second one waits,
 * then re-reads the balance the first one left behind rather than the balance it saw
 * before the first committed.
 */
export async function reserveCredits(
  userId: string,
  requestId: string,
  amount: number,
): Promise<CreditOperationResult> {
  return withTransaction(async (client) => {
    const current = await lockBalanceForUpdate(client, userId);

    if (!current) {
      throw new AppError(404, 'No credit balance exists for this user.', 'BALANCE_NOT_FOUND');
    }

    const unreserved = current.total_balance - current.reserved_balance;
    if (amount > unreserved) {
      // F19.2.3. Reserved credits are unavailable to any other transaction (F19.2.2),
      // which is exactly why the comparison is against unreserved and not total.
      throw new AppError(
        422,
        `Offer of ${amount} credits exceeds the unreserved balance of ${unreserved}.`,
        'INSUFFICIENT_UNRESERVED_CREDITS',
      );
    }

    const balance = await increaseReservedBalance(client, userId, amount);

    let transaction: TransactionRow;
    try {
      transaction = await insertTransaction(client, {
        transactionType: 'reservation',
        originatingUserId: userId,
        destinationUserId: null,
        amount,
        requestId,
      });
    } catch (err) {
      // Team decision 2026-09-26: one reservation per request, enforced by a unique
      // partial index. A repeated "request created" trigger lands here, and the throw
      // rolls back the reserved_balance increase above.
      if (
        isPgError(err, PG_UNIQUE_VIOLATION) &&
        pgConstraint(err) === 'transaction_log_one_reservation_per_request'
      ) {
        throw new AppError(
          409,
          'Credits have already been reserved for this request.',
          'RESERVATION_ALREADY_EXISTS',
        );
      }
      throw err;
    }

    return { balance: toBalanceView(balance), transaction };
  });
}

/**
 * F19.3.1 - move the reserved credits from the requester to the courier.
 * F19.3.2 - at most one transfer per request.
 *
 * The amount and the requester are read back from the reservation row, not taken from
 * the caller, so a transfer can only ever move exactly what was held. The courier comes
 * from the request body: Credit Service does not look couriers up and keeps no courier
 * reference of its own (team decision 2026-10-16).
 *
 * Idempotent on requestId, so a later retry of a failed completion is safe to send.
 */
export async function transferCredits(
  requestId: string,
  courierId: string,
): Promise<CreditOperationResult> {
  return withTransaction(async (client) => {
    const reservation = await findReservation(client, requestId);
    if (!reservation) {
      throw new AppError(
        404,
        'No credits are reserved for this request.',
        'RESERVATION_NOT_FOUND',
      );
    }

    if (await hasTransactionOfType(client, requestId, 'transfer')) {
      throw new AppError(
        409,
        'Credits for this request have already been transferred.',
        'ALREADY_TRANSFERRED',
      );
    }

    // Not specified by any requirement; see API.md. Released credits are back in the
    // requester's unreserved balance, so transferring them would move credits that are
    // no longer held and drive reserved_balance negative.
    if (await hasTransactionOfType(client, requestId, 'release')) {
      throw new AppError(
        409,
        'Credits for this request have already been released.',
        'ALREADY_RELEASED',
      );
    }

    const { requesterId, amount } = reservation;
    const locked = await lockTwoBalancesForUpdate(client, requesterId, courierId);

    if (!locked.has(courierId)) {
      // Deliberately not created here: credits may only enter the economy through
      // F19.1.1 (team decision 2026-10-16).
      throw new AppError(404, 'The courier has no credit balance.', 'COURIER_NOT_FOUND');
    }
    if (!locked.has(requesterId)) {
      throw new AppError(
        404,
        'The requester has no credit balance.',
        'BALANCE_NOT_FOUND',
      );
    }

    const requesterBalance = await debitRequesterForTransfer(client, requesterId, amount);
    await creditCourierForTransfer(client, courierId, amount);

    let transaction: TransactionRow;
    try {
      transaction = await insertTransaction(client, {
        transactionType: 'transfer',
        originatingUserId: requesterId,
        destinationUserId: courierId,
        amount,
        requestId,
      });
    } catch (err) {
      // F19.3.2 under concurrency: two completions racing both pass the check above,
      // and the unique index settles it. The throw rolls back both balance updates.
      if (
        isPgError(err, PG_UNIQUE_VIOLATION) &&
        pgConstraint(err) === 'transaction_log_one_transfer_per_request'
      ) {
        throw new AppError(
          409,
          'Credits for this request have already been transferred.',
          'ALREADY_TRANSFERRED',
        );
      }
      throw err;
    }

    // The requester's balance is returned: it is the wallet the caller debited.
    return { balance: toBalanceView(requesterBalance), transaction };
  });
}

/**
 * F19.4.1 - return the reserved credits to the requester when a request is cancelled
 * or expires.
 *
 * Takes only a requestId. Credit Service has no clock and does not detect expiry; the
 * caller decides why the credits are coming back (team decision 2026-10-16), so both
 * cancellation and expiry arrive here identically.
 *
 * Reserved falls by the amount; total is untouched (context §5).
 */
export async function releaseCredits(requestId: string): Promise<CreditOperationResult> {
  return withTransaction(async (client) => {
    const reservation = await findReservation(client, requestId);
    if (!reservation) {
      throw new AppError(
        404,
        'No credits are reserved for this request.',
        'RESERVATION_NOT_FOUND',
      );
    }

    if (await hasTransactionOfType(client, requestId, 'release')) {
      throw new AppError(
        409,
        'Credits for this request have already been released.',
        'ALREADY_RELEASED',
      );
    }

    // Not specified by any requirement; see API.md. Transferred credits belong to the
    // courier and are no longer the requester's to reclaim.
    if (await hasTransactionOfType(client, requestId, 'transfer')) {
      throw new AppError(
        409,
        'Credits for this request have already been transferred.',
        'ALREADY_TRANSFERRED',
      );
    }

    const { requesterId, amount } = reservation;
    const current = await lockBalanceForUpdate(client, requesterId);
    if (!current) {
      throw new AppError(404, 'No credit balance exists for this user.', 'BALANCE_NOT_FOUND');
    }

    const balance = await decreaseReservedBalance(client, requesterId, amount);

    let transaction: TransactionRow;
    try {
      transaction = await insertTransaction(client, {
        transactionType: 'release',
        originatingUserId: requesterId,
        destinationUserId: null,
        amount,
        requestId,
      });
    } catch (err) {
      if (
        isPgError(err, PG_UNIQUE_VIOLATION) &&
        pgConstraint(err) === 'transaction_log_one_release_per_request'
      ) {
        throw new AppError(
          409,
          'Credits for this request have already been released.',
          'ALREADY_RELEASED',
        );
      }
      throw err;
    }

    return { balance: toBalanceView(balance), transaction };
  });
}

/**
 * F19.5.1 - read a user's total, reserved and unreserved balance.
 *
 * No transaction and no lock: this is a point-in-time read, and holding a lock would
 * make a read block the writes it is reporting on.
 */
export async function getBalance(userId: string): Promise<BalanceView> {
  const row = await readBalance(pool, userId);
  if (!row) {
    throw new AppError(404, 'No credit balance exists for this user.', 'BALANCE_NOT_FOUND');
  }
  return toBalanceView(row);
}

export interface TransactionPage {
  transactions: TransactionRow[];
  /** Opaque; pass back as ?cursor= to get the next page. null on the last page. */
  nextCursor: string | null;
}

/**
 * The cursor is base64 of "<createdAt ISO>|<transactionId>". Opaque so callers treat it
 * as a token rather than building their own, which would couple them to the ordering.
 */
function encodeCursor(row: TransactionRow): string {
  return Buffer.from(`${row.created_at.toISOString()}|${row.transaction_id}`).toString('base64url');
}

function decodeCursor(cursor: string | undefined): TransactionCursor | null {
  if (!cursor) return null;
  const [createdAt, transactionId] = Buffer.from(cursor, 'base64url').toString('utf8').split('|');
  if (!createdAt || !transactionId || Number.isNaN(Date.parse(createdAt))) {
    throw new AppError(400, 'Malformed pagination cursor.', 'INVALID_CURSOR');
  }
  return { createdAt, transactionId };
}

async function page(
  filters: TransactionFilters,
  cursor: string | undefined,
): Promise<TransactionPage> {
  const rows = await listTransactions(pool, filters, decodeCursor(cursor));
  // listTransactions fetches one extra row purely to answer "is there more?".
  const hasMore = rows.length > TRANSACTION_PAGE_SIZE;
  const transactions = hasMore ? rows.slice(0, TRANSACTION_PAGE_SIZE) : rows;
  const last = transactions[transactions.length - 1];
  return {
    transactions,
    nextCursor: hasMore && last ? encodeCursor(last) : null,
  };
}

/**
 * F19.5.2 - the caller's own records: rows where they are the originating or the
 * destination user.
 */
export function getTransactionsForUser(
  userId: string,
  cursor?: string,
): Promise<TransactionPage> {
  // userId here is the caller's own scope, taken from the verified token, not a filter
  // the caller can choose. The route has no user parameter for exactly that reason.
  return page({ userId }, cursor);
}

/**
 * F20.2 - every user's records, for audit.
 *
 * Same field set as the user view; only the row scope differs (team decision
 * 2026-10-19). Access is gated by middleware, not here.
 *
 * Optionally narrowed by user and/or order. Both are plain filters over the same rows
 * this endpoint already returns, so they inherit its auth gate, page size, ordering and
 * row shape rather than duplicating them. No filter means the unchanged behaviour.
 *
 * An unmatched filter yields an empty page, not a 404: Credit Service holds no list of
 * users or orders, and an order with no credit activity yet is an ordinary state rather
 * than a missing resource.
 */
export function getAllTransactions(
  filters: TransactionFilters = {},
  cursor?: string,
): Promise<TransactionPage> {
  return page(filters, cursor);
}
