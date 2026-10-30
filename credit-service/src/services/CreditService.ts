// AI Assistance Disclosure:
// Tool: OpenAI Codex (model: GPT-6), dates: 2026-10-20–2026-10-26 (Asia/Singapore).
// Scope: Implemented human-specified core credit business rules, reads, and transaction ownership. Resolved history-entry bookmarks to private sequence boundaries within the authenticated user's scope. Removed idempotency user metadata from saved results
// Refactor: Moved/imports updated for the human-specified src layout (entry 024).
// Author review: I reviewed and edited the initial allocation to use a constant and removed the hard-coded 10 across four usages.
// Prompts and key responses: ../../ai/usage-log.md, entries 005–026, 028, 043, 045.

import { createHash } from 'node:crypto';
import type { Pool } from 'pg';
import type { Balance__Output as Balance } from '@foc/grpc/dist/generated/credit/Balance';
import { SqlCreditRepository } from '../repos/SqlCreditRepository';
import type { CreditRepository } from '../repos/CreditRepository';
import type { CreditHistoryEntry, Reservation } from '../domains/types';
import { assertIdentifier, assertOrderId, assertPositiveInteger, assertUserId, ValidationError } from './validation';
import { decodeHistoryBookmark, encodeHistoryBookmark } from './historyBookmark';

type InitialAllocationBalance = Omit<Balance, 'userId'>;
const initAlloc = 10;

export interface CreditHistoryPage {
  entries: CreditHistoryEntry[];
  nextPageToken: string | null;
}

export class CreditOperationError extends Error {
  constructor(
    readonly code: 'ALREADY_EXISTS' | 'FAILED_PRECONDITION' | 'NOT_FOUND',
    message: string,
    readonly reason?: string,
  ) {
    super(message);
    this.name = 'CreditOperationError';
  }
}

export class InitialAllocationError extends CreditOperationError {
  constructor(code: 'ALREADY_EXISTS' | 'FAILED_PRECONDITION', message: string) {
    super(code, message);
    this.name = 'InitialAllocationError';
  }
}

export class CreditService {
  constructor(private readonly pool: Pool) {}

  async getUserCreditHistory(
    { userId, pageSize = 50, pageToken }: { userId: string; pageSize?: number; pageToken?: string },
  ): Promise<CreditHistoryPage> {
    assertUserId(userId);
    assertPositiveInteger(pageSize, 'pageSize');
    if (pageSize > 100) throw new ValidationError('pageSize must be at most 100');
    const entryId = pageToken === undefined ? undefined : decodeHistoryBookmark(pageToken);
    return this.read(async (repository) => {
      const boundary = entryId === undefined ? undefined : await repository.findHistorySequenceId(entryId, userId);
      if (entryId !== undefined && boundary === undefined) throw new ValidationError('Invalid history page token');
      const rows = await repository.findHistoryByUser(userId, boundary, pageSize + 1);
      const entries = rows.slice(0, pageSize);
      return {
        entries,
        nextPageToken: rows.length > pageSize
          ? encodeHistoryBookmark(entries[entries.length - 1].id) : null,
      };
    });
  }

  async getBalance({ userId }: { userId: string }): Promise<Balance> {
    assertUserId(userId);
    return this.read(async (repository) => {
      const account = await repository.findAccount(userId);
      if (!account) throw new CreditOperationError('NOT_FOUND', 'Credit account not found', 'ACCOUNT_NOT_FOUND');
      return {
        userId: account.userId,
        totalCredits: account.totalCredits,
        reservedCredits: account.reservedCredits,
        availableCredits: account.totalCredits - account.reservedCredits,
      };
    });
  }

  async getReservation({ orderId }: { orderId: string }): Promise<Reservation> {
    assertOrderId(orderId);
    return this.read(async (repository) => {
      const reservation = await repository.findReservation(orderId);
      if (!reservation) throw new CreditOperationError('NOT_FOUND', 'Reservation not found', 'RESERVATION_NOT_FOUND');
      return reservation;
    });
  }

  async reserveCredits(
    { orderId, requesterId, amount }: { orderId: string; requesterId: string; amount: number },
  ): Promise<Reservation> {
    assertOrderId(orderId);
    assertIdentifier(requesterId, 'requesterId');
    assertPositiveInteger(amount, 'amount');
    return this.mutateReservation('reserve', orderId, orderId, ['RESERVE', orderId, requesterId, amount], async (repository) => {
      const existing = await repository.findReservation(orderId);
      if (existing) {
        if (existing.requesterId !== requesterId || existing.amount !== amount) {
          throw new CreditOperationError('FAILED_PRECONDITION', 'Reservation request conflicts with the existing reservation', 'REQUEST_CONFLICT');
        }
        return { reservation: existing, changed: false };
      }
      await repository.lockAccounts([requesterId]);
      const account = await repository.findAccount(requesterId);
      if (!account) throw new CreditOperationError('NOT_FOUND', 'Requester credit account not found', 'ACCOUNT_NOT_FOUND');
      if (account.totalCredits - account.reservedCredits < amount) {
        throw new CreditOperationError('FAILED_PRECONDITION', 'Insufficient available credits', 'INSUFFICIENT_CREDITS');
      }
      await repository.saveAccount({ ...account, reservedCredits: account.reservedCredits + amount });
      const reservation = await repository.createReservation({ orderId, requesterId, amount });
      await repository.appendHistory({
        userId: requesterId, orderId, reservationId: reservation.reservationId,
        type: 'RESERVED', totalAmountChange: 0, totalReservedChange: amount,
      });
      return { reservation };
    });
  }

  async releaseCredits({ orderId }: { orderId: string }): Promise<Reservation> {
    assertOrderId(orderId);
    return this.mutateReservation('release', orderId, orderId, ['RELEASE', orderId], async (repository) => {
      const reservation = await repository.findReservation(orderId);
      if (!reservation) throw new CreditOperationError('NOT_FOUND', 'Reservation not found', 'RESERVATION_NOT_FOUND');
      if (reservation.status === 'RELEASED') return { reservation, changed: false };
      if (reservation.status !== 'RESERVED') {
        throw new CreditOperationError('FAILED_PRECONDITION', 'Settled credits cannot be released', 'INVALID_STATE');
      }
      await repository.lockAccounts([reservation.requesterId]);
      const account = await repository.findAccount(reservation.requesterId);
      if (!account) throw new CreditOperationError('NOT_FOUND', 'Requester credit account not found', 'ACCOUNT_NOT_FOUND');
      await repository.saveAccount({ ...account, reservedCredits: account.reservedCredits - reservation.amount });
      const released: Reservation = { ...reservation, status: 'RELEASED', version: reservation.version + 1 };
      await repository.saveReservation(released);
      await repository.appendHistory({
        userId: reservation.requesterId, orderId, reservationId: reservation.reservationId,
        type: 'RELEASED', totalAmountChange: 0, totalReservedChange: -reservation.amount,
      });
      return { reservation: released };
    });
  }

  async settleCredits({ orderId, courierId }: { orderId: string; courierId: string }): Promise<Reservation> {
    assertOrderId(orderId);
    assertIdentifier(courierId, 'courierId');
    return this.mutateReservation('transfer', orderId, orderId, ['SETTLE', orderId, courierId], async (repository) => {
      const reservation = await repository.findReservation(orderId);
      if (!reservation) throw new CreditOperationError('NOT_FOUND', 'Reservation not found', 'RESERVATION_NOT_FOUND');
      if (reservation.status === 'SETTLED') {
        if (reservation.courierId !== courierId) {
          throw new CreditOperationError('FAILED_PRECONDITION', 'Reservation was settled with a different courier', 'REQUEST_CONFLICT');
        }
        return { reservation, changed: false };
      }
      if (reservation.status !== 'RESERVED') {
        throw new CreditOperationError('FAILED_PRECONDITION', 'Reservation is not active', 'INVALID_STATE');
      }
      if (courierId === reservation.requesterId) {
        throw new CreditOperationError('FAILED_PRECONDITION', 'Courier cannot be the requester', 'INVALID_STATE');
      }
      await repository.lockAccounts([reservation.requesterId, courierId]);
      const requester = await repository.findAccount(reservation.requesterId);
      const courier = await repository.findAccount(courierId);
      if (!requester) throw new CreditOperationError('NOT_FOUND', 'Requester credit account not found', 'ACCOUNT_NOT_FOUND');
      if (!courier) throw new CreditOperationError('NOT_FOUND', `Courier credit account not found: ${courierId}`, 'ACCOUNT_NOT_FOUND');
      await repository.saveAccount({
        ...requester, totalCredits: requester.totalCredits - reservation.amount,
        reservedCredits: requester.reservedCredits - reservation.amount,
      });
      await repository.saveAccount({ ...courier, totalCredits: courier.totalCredits + reservation.amount });
      const settled: Reservation = {
        ...reservation, courierId, status: 'SETTLED', version: reservation.version + 1,
      };
      await repository.saveReservation(settled);
      await repository.appendHistory({
        userId: reservation.requesterId, orderId, reservationId: reservation.reservationId,
        type: 'TRANSFER_OUT', totalAmountChange: -reservation.amount, totalReservedChange: -reservation.amount,
      });
      await repository.appendHistory({
        userId: courierId, orderId, reservationId: reservation.reservationId,
        type: 'TRANSFER_IN', totalAmountChange: reservation.amount, totalReservedChange: 0,
      });
      return { reservation: settled };
    });
  }

  async updateReservation(
    { orderId, amount, expectedVersion }: { orderId: string; amount: number; expectedVersion: number },
  ): Promise<Reservation> {
    assertOrderId(orderId);
    assertPositiveInteger(amount, 'amount');
    assertPositiveInteger(expectedVersion, 'expectedVersion');
    return this.mutateReservation(
      'update', orderId, JSON.stringify([orderId, expectedVersion]),
      ['UPDATE', orderId, amount, expectedVersion],
      async (repository) => {
        const reservation = await repository.findReservation(orderId);
        if (!reservation) throw new CreditOperationError('NOT_FOUND', 'Reservation not found', 'RESERVATION_NOT_FOUND');
        if (reservation.status !== 'RESERVED') {
          throw new CreditOperationError('FAILED_PRECONDITION', 'Reservation is not active', 'INVALID_STATE');
        }
        if (reservation.version !== expectedVersion) {
          throw new CreditOperationError('FAILED_PRECONDITION', 'Reservation version does not match', 'VERSION_CONFLICT');
        }
        if (reservation.amount === amount) {
          throw new CreditOperationError('FAILED_PRECONDITION', 'Reservation amount has not changed', 'INVALID_STATE');
        }
        await repository.lockAccounts([reservation.requesterId]);
        const account = await repository.findAccount(reservation.requesterId);
        if (!account) throw new CreditOperationError('NOT_FOUND', 'Requester credit account not found', 'ACCOUNT_NOT_FOUND');
        const difference = amount - reservation.amount;
        if (difference > 0 && account.totalCredits - account.reservedCredits < difference) {
          throw new CreditOperationError('FAILED_PRECONDITION', 'Insufficient available credits', 'INSUFFICIENT_CREDITS');
        }
        await repository.saveAccount({ ...account, reservedCredits: account.reservedCredits + difference });
        const updated = { ...reservation, amount, version: reservation.version + 1 };
        await repository.saveReservation(updated);
        await repository.appendHistory({
          userId: reservation.requesterId, orderId, reservationId: reservation.reservationId,
          type: 'RESERVATION_UPDATED', totalAmountChange: 0, totalReservedChange: difference,
        });
        return { reservation: updated };
      },
    );
  }

  async initCredits({ userId }: { userId: string }): Promise<InitialAllocationBalance> {
    assertUserId(userId);
    const operation = 'init_credits';
    const requestHash = createHash('sha256')
      .update(JSON.stringify(['INIT', userId]), 'utf8').digest('hex');
    const client = await this.pool.connect();
    let inTransaction = false;
    let discardConnection = false;

    try {
      await client.query('BEGIN ISOLATION LEVEL READ COMMITTED');
      inTransaction = true;
      const repository = new SqlCreditRepository(client);
      await repository.lockKey(operation, userId);
      const saved = await repository.findIdempotencyRecord<InitialAllocationBalance>(operation, userId);
      let result: InitialAllocationBalance;
      let confirmedExistingGrant = false;

      if (saved) {
        if (saved.requestHash !== requestHash) {
          throw new InitialAllocationError('FAILED_PRECONDITION', 'Initialization key reused with a different request');
        }
        result = saved.result;
        confirmedExistingGrant = true;
      } else {
        await repository.lockKey('account', userId);
        await repository.lockAccounts([userId]);
        const account = await repository.findAccount(userId);
        if (account) {
          const grant = await repository.findCreditHistoryEntry(userId, 'INITIAL_GRANT');
          if (!grant || grant.totalAmountChange !== initAlloc || grant.totalReservedChange !== 0) {
            throw new InitialAllocationError('ALREADY_EXISTS', 'Credit account exists without a confirmed initial grant');
          }
          result = {
            totalCredits: account.totalCredits,
            reservedCredits: account.reservedCredits,
            availableCredits: account.totalCredits - account.reservedCredits,
          };
          confirmedExistingGrant = true;
        } else {
          result = { totalCredits: initAlloc, reservedCredits: 0, availableCredits: initAlloc };
          await repository.createAccount({ userId, totalCredits: initAlloc, reservedCredits: 0 });
          await repository.appendHistory({
            userId, orderId: null, reservationId: null, type: 'INITIAL_GRANT',
            totalAmountChange: initAlloc, totalReservedChange: 0,
          });
          await repository.saveIdempotencyRecord({
            operationType: operation, key: userId, requestHash, result,
          });
        }
      }

      await client.query('COMMIT');
      inTransaction = false;
      if (confirmedExistingGrant) {
        console.info('Initial credit grant already confirmed', { userId });
      }
      return result;
    } catch (error) {
      if (inTransaction) {
        try { await client.query('ROLLBACK'); }
        catch (rollbackError) {
          discardConnection = true;
          throw new AggregateError([error, rollbackError], 'Initial allocation and rollback failed');
        }
      }
      throw error;
    } finally {
      client.release(discardConnection);
    }
  }

  private async read<Result>(work: (repository: CreditRepository) => Promise<Result>): Promise<Result> {
    const client = await this.pool.connect();
    try { return await work(new SqlCreditRepository(client)); }
    finally { client.release(); }
  }

  private async mutateReservation(
    operation: 'reserve' | 'update' | 'release' | 'transfer',
    orderId: string,
    key: string,
    fields: (string | number)[],
    work: (repository: CreditRepository) => Promise<{ reservation: Reservation; changed?: boolean }>,
  ): Promise<Reservation> {
    const requestHash = createHash('sha256').update(JSON.stringify(fields), 'utf8').digest('hex');
    return this.transaction(async (repository) => {
      await repository.lockKey(operation, key);
      const saved = await repository.findIdempotencyRecord<Reservation>(operation, key);
      if (saved) {
        if (saved.requestHash !== requestHash) {
          throw new CreditOperationError('FAILED_PRECONDITION', 'Idempotency key reused with a different request', 'REQUEST_CONFLICT');
        }
        return saved.result;
      }
      await repository.lockKey('order', orderId);
      const { reservation, changed } = await work(repository);
      if (changed !== false) {
        await repository.saveIdempotencyRecord({
          operationType: operation, key, requestHash, result: reservation,
        });
      }
      return reservation;
    });
  }

  private async transaction<Result>(
    work: (repository: CreditRepository) => Promise<Result>,
  ): Promise<Result> {
    const client = await this.pool.connect();
    let inTransaction = false;
    let discardConnection = false;
    try {
      await client.query('BEGIN ISOLATION LEVEL READ COMMITTED');
      inTransaction = true;
      const result = await work(new SqlCreditRepository(client));
      await client.query('COMMIT');
      inTransaction = false;
      return result;
    } catch (error) {
      if (inTransaction) {
        try { await client.query('ROLLBACK'); }
        catch (rollbackError) {
          discardConnection = true;
          throw new AggregateError([error, rollbackError], 'Credit operation and rollback failed');
        }
      }
      throw error;
    } finally {
      client.release(discardConnection);
    }
  }
}
