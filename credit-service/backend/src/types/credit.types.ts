/*
 * AI Assistance Disclosure:
 * Tool: ChatGPT (model: GPT-6 Sol), date: 2026-10-14
 * Scope: Generated implementation of this module.
 * Author review: Verified correctness.
 */
import type { CreditErrorCode } from '@relay/contracts'

export class CreditServiceError extends Error {
  constructor(
    readonly code: CreditErrorCode,
    message: string,
    readonly statusCode: number,
  ) {
    super(message)
    this.name = 'CreditServiceError'
  }
}
