/*
 * AI Assistance Disclosure:
 * Tool: ChatGPT (model: GPT-6 Sol), date: 2026-10-17
 * Scope: Generated implementation of findReservation, allocateInitialCredit, closeUnreservedCredit, reserveCredit, releaseCredit, transferCredit, deleteUserCredit, viewCredit, findBalance, viewCreditHistory.
 * Author review: Verified correctness.
 */
import type {
  ViewCreditRequest,
  ViewCreditResponse,
  ViewCreditHistoryRequest,
  ViewCreditHistoryResponse,
  AllocateInitialCreditCommand,
  DeleteUserCreditCommand,
  ReleaseCreditCommand,
  ReserveCreditRequest,
  ReserveCreditResponse,
  TransferCreditCommand,
  TransactionReference,
} from '@relay/contracts'
import { CreditRepository, type UserCreditEventOutcome } from '../repositories/credit.repository.js'
import { CreditServiceError } from '../types/credit.types.js'

export class CreditService {
  constructor(private readonly repository: CreditRepository) {}

  async findReservation(
    ref: Pick<TransactionReference, 'service' | 'id'>,
  ): Promise<{ userId: string; amount: number } | null> {
    return this.repository.findReservation(ref)
  }

  async allocateInitialCredit(
    command: AllocateInitialCreditCommand,
  ): Promise<UserCreditEventOutcome> {
    return this.repository.allocateInitialCredit(command)
  }

  async closeUnreservedCredit(ref: TransactionReference, userId: string): Promise<void> {
    await this.repository.closeUnreservedCredit(ref, userId)
  }

  async reserveCredit(request: ReserveCreditRequest): Promise<ReserveCreditResponse> {
    return this.repository.reserveCredit(request)
  }

  async releaseCredit(command: ReleaseCreditCommand): Promise<void> {
    await this.repository.releaseCredit(command)
  }

  async transferCredit(command: TransferCreditCommand): Promise<void> {
    await this.repository.transferCredit(command)
  }

  async deleteUserCredit(command: DeleteUserCreditCommand): Promise<UserCreditEventOutcome> {
    return this.repository.deleteUserCredit(command)
  }

  async viewCredit(request: ViewCreditRequest): Promise<ViewCreditResponse> {
    const balance = await this.repository.findBalance(request.userId)
    if (!balance) {
      throw new CreditServiceError('USER_NOT_FOUND', 'The user has no credit balance record.', 404)
    }
    return balance
  }

  async viewCreditHistory(request: ViewCreditHistoryRequest): Promise<ViewCreditHistoryResponse> {
    return { records: await this.repository.findHistory(request.userId, request.offset) }
  }
}
