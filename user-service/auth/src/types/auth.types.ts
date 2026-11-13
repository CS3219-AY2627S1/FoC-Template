/*
 * AI Assistance Disclosure:
 * Tool: ChatGPT (model: GPT-6 Sol), date: 2026-10-28
 * Scope: Generated implementation for authentication types and errors
 * Author review: Verified correctness.
 */

import type { UserApiErrorCode } from '@relay/contracts/user-auth'
export class AuthError extends Error {
  constructor(
    public code: UserApiErrorCode,
    message: string,
    public status = 400,
    public fieldErrors?: Record<string, string>,
  ) {
    super(message)
  }
}
