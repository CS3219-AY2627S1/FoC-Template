// AI Assistance Disclosure:
// Tool: OpenAI Codex (model: GPT-6), dates: 2026-10-20–2026-10-26 (Asia/Singapore).
// Scope: Implemented human-specified SQL account/reservation/history/idempotency operations and transaction-level bigint advisory/row locks. Removed account timestamp reads and account/reservation timestamp writes. Looked up bookmark sequence boundaries by history entry ID and authenticated user ID. Removed idempotency user-column reads/writes.
// Refactor: Moved/imports updated for the human-specified src layout (entry 024).
// Author review: I reviewed the pure SQL operations, and ultimately changed the design to remove accounts, reservation, idempotency records timestamp fields as well as user id field in idempotency records..
// Prompts and key responses: ../../ai/usage-log.md, entries 005–024, 040, 043, 045 (prior scopes retained).

import type { PoolClient } from 'pg';
import type {
  CreditAccount, CreditHistoryEntry, IdempotencyRecord, Reservation,
} from '../domains/types';
import type { CreditRepository } from './CreditRepository';
import { advisoryLockKey } from './advisoryLockKey';

export class SqlCreditRepository implements CreditRepository {
  constructor(private readonly client: PoolClient) {}

  async lockKey(namespace: string, key: string): Promise<void> {
    await this.client.query('SELECT pg_advisory_xact_lock($1::bigint)', [
      advisoryLockKey(namespace, key).toString(),
    ]);
  }

  async lockAccounts(userIds: string[]): Promise<void> {
    for (const userId of [...new Set(userIds)].sort()) {
      await this.client.query('SELECT user_id FROM credit_accounts WHERE user_id = $1 FOR UPDATE', [userId]);
    }
  }

  async findIdempotencyRecord<Result>(operation: string, key: string): Promise<IdempotencyRecord<Result> | undefined> {
    const { rows } = await this.client.query<IdempotencyRecord<Result>>(
      'SELECT operation_type AS "operationType", idempotency_key AS key, request_hash AS "requestHash", result FROM idempotency_records WHERE operation_type = $1 AND idempotency_key = $2',
      [operation, key],
    );
    return rows[0];
  }

  async saveIdempotencyRecord<Result>(record: IdempotencyRecord<Result>): Promise<void> {
    await this.client.query(
      'INSERT INTO idempotency_records (operation_type, idempotency_key, request_hash, result) VALUES ($1, $2, $3, $4)',
      [record.operationType, record.key, record.requestHash, record.result],
    );
  }

  async findAccount(userId: string): Promise<CreditAccount | undefined> {
    const { rows } = await this.client.query<CreditAccount>(
      'SELECT user_id AS "userId", total_credits AS "totalCredits", reserved_credits AS "reservedCredits" FROM credit_accounts WHERE user_id = $1',
      [userId],
    );
    return rows[0];
  }

  async createAccount(account: Pick<CreditAccount, 'userId' | 'totalCredits' | 'reservedCredits'>): Promise<void> {
    await this.client.query(
      'INSERT INTO credit_accounts (user_id, total_credits, reserved_credits) VALUES ($1, $2, $3)',
      [account.userId, account.totalCredits, account.reservedCredits],
    );
  }

  async saveAccount(account: CreditAccount): Promise<void> {
    const result = await this.client.query(
      'UPDATE credit_accounts SET total_credits = $2, reserved_credits = $3 WHERE user_id = $1',
      [account.userId, account.totalCredits, account.reservedCredits],
    );
    if (result.rowCount !== 1) throw new Error('Account disappeared during its locked update');
  }

  async findReservation(orderId: string): Promise<Reservation | undefined> {
    const { rows } = await this.client.query<Omit<Reservation, 'courierId'> & { courierId: string | null }>(
      'SELECT order_id AS "orderId", requester_id AS "requesterId", credit_amount AS amount, status, courier_id AS "courierId", reservation_id AS "reservationId", version FROM reservations WHERE order_id = $1',
      [orderId],
    );
    if (!rows[0]) return undefined;
    const { courierId, ...reservation } = rows[0];
    return courierId === null ? reservation : { ...reservation, courierId };
  }

  async createReservation(reservation: Pick<Reservation, 'orderId' | 'requesterId' | 'amount'>): Promise<Reservation> {
    const { rows } = await this.client.query<{ reservationId: string }>(
      'INSERT INTO reservations (order_id, requester_id, credit_amount, version) VALUES ($1, $2, $3, $4) RETURNING reservation_id AS "reservationId"',
      [reservation.orderId, reservation.requesterId, reservation.amount, 1],
    );
    return { ...reservation, reservationId: rows[0].reservationId, status: 'RESERVED', version: 1 };
  }

  async saveReservation(reservation: Reservation): Promise<void> {
    const result = await this.client.query(
      'UPDATE reservations SET credit_amount = $2, status = $3, courier_id = $4, version = $5 WHERE reservation_id = $1',
      [reservation.reservationId, reservation.amount, reservation.status, reservation.courierId ?? null, reservation.version],
    );
    if (result.rowCount !== 1) throw new Error('Reservation disappeared during its locked update');
  }

  async findCreditHistoryEntry(userId: string, type: string): Promise<CreditHistoryEntry | undefined> {
    const { rows } = await this.client.query<CreditHistoryEntry>(
      'SELECT id, sequence_id AS "sequenceId", user_id AS "userId", order_id AS "orderId", reservation_id AS "reservationId", type, total_amount_change AS "totalAmountChange", total_reserved_change AS "totalReservedChange", created_at AS "createdAt" FROM credit_history WHERE user_id = $1 AND type = $2 LIMIT 1',
      [userId, type],
    );
    return rows[0];
  }

  async appendHistory(entry: Omit<CreditHistoryEntry, 'id' | 'createdAt' | 'sequenceId'>): Promise<void> {
    await this.client.query(
      'INSERT INTO credit_history (user_id, order_id, reservation_id, type, total_amount_change, total_reserved_change) VALUES ($1, $2, $3, $4, $5, $6)',
      [entry.userId, entry.orderId, entry.reservationId, entry.type, entry.totalAmountChange, entry.totalReservedChange],
    );
  }

  async findHistorySequenceId(id: string, userId: string): Promise<string | undefined> {
    const { rows } = await this.client.query<{ sequenceId: string }>(
      'SELECT sequence_id AS "sequenceId" FROM credit_history WHERE id = $1 AND user_id = $2',
      [id, userId],
    );
    return rows[0]?.sequenceId;
  }

  async findHistoryByUser(userId: string, beforeSequenceId: string | undefined, limit: number): Promise<CreditHistoryEntry[]> {
    const { rows } = await this.client.query<CreditHistoryEntry>(
      'SELECT id, sequence_id AS "sequenceId", user_id AS "userId", order_id AS "orderId", reservation_id AS "reservationId", type, total_amount_change AS "totalAmountChange", total_reserved_change AS "totalReservedChange", created_at AS "createdAt" FROM credit_history WHERE user_id = $1 AND ($2::bigint IS NULL OR sequence_id < $2::bigint) ORDER BY sequence_id DESC LIMIT $3',
      [userId, beforeSequenceId ?? null, limit],
    );
    return rows;
  }
}
