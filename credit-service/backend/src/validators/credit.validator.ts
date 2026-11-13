/*
 * AI Assistance Disclosure:
 * Tool: ChatGPT (model: GPT-6 Sol), date: 2026-10-17
 * Scope: Generated implementation of authenticatedUserId and reserveCreditRequest.
 * Author review: Verified correctness and checked error codes and messages.
 */
import type { Request, Response } from 'express'
import type { ReserveCreditRequest } from '@relay/contracts'
import { CreditServiceError } from '../types/credit.types.js'

export function authenticatedUserId(req: Request, res: Response): string {
  const subject = res.locals.creditUserId as string
  const requested = req.query.userId
  if (requested !== undefined) {
    if (typeof requested !== 'string' || !requested.trim()) {
      throw new CreditServiceError('INVALID_REQUEST', 'userId must be a non-empty string.', 400)
    }
    if (requested !== subject) {
      throw new CreditServiceError('FORBIDDEN', 'You can only view your own credits.', 403)
    }
  }
  return subject
}

export function historyOffset(req: Request): number {
  const raw = req.query.offset
  if (raw === undefined) return 0
  if (typeof raw !== 'string' || !/^(0|[1-9]\d*)$/.test(raw)) {
    throw new CreditServiceError('INVALID_REQUEST', 'offset must be a non-negative integer.', 400)
  }
  const offset = Number(raw)
  if (!Number.isSafeInteger(offset) || offset > 2147483647) {
    throw new CreditServiceError('INVALID_REQUEST', 'offset must be at most 2147483647.', 400)
  }
  return offset
}

export function reserveCreditRequest(req: Request, res: Response): ReserveCreditRequest {
  const userId = authenticatedUserId(req, res)
  const body: unknown = req.body
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new CreditServiceError('INVALID_REQUEST', 'A reservation request is required.', 400)
  }
  const input = body as Record<string, unknown>
  if (typeof input.userId !== 'string' || !input.userId.trim()) {
    throw new CreditServiceError('INVALID_REQUEST', 'userId must be a non-empty string.', 400)
  }
  if (input.userId !== userId) {
    throw new CreditServiceError('FORBIDDEN', 'You can only reserve your own credits.', 403)
  }
  const reference = input.transactionReference
  if (!reference || typeof reference !== 'object' || Array.isArray(reference)) {
    throw new CreditServiceError('INVALID_REQUEST', 'A transaction reference is required.', 400)
  }
  const ref = reference as Record<string, unknown>
  if (
    typeof ref.service !== 'string' ||
    !ref.service.trim() ||
    ref.service.includes(':') ||
    typeof ref.id !== 'string' ||
    !ref.id.trim() ||
    ref.id.includes(':') ||
    ref.type !== 'CREDIT_RESERVE'
  ) {
    throw new CreditServiceError('INVALID_REQUEST', 'Invalid credit reservation reference.', 400)
  }
  if (typeof input.amount !== 'number' || !Number.isFinite(input.amount) || input.amount < 0) {
    throw new CreditServiceError(
      'INVALID_CREDIT_AMOUNT',
      'Credit amount must be a nonnegative number.',
      422,
    )
  }
  return {
    transactionReference: { service: ref.service, id: ref.id, type: ref.type },
    userId,
    amount: input.amount,
  }
}
