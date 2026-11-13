// AI Assistance Disclosure:
// Tool: ChatGPT (model: GPT-5.6 Luna), date: 2026-10-11
// Scope: Generated initial implementation of the Errand Service types.
// Author review: I validated correctness, edited for domain needs, and debugged as necessary.

import type { ErrandErrorCode, UserRole } from '@relay/contracts'

export type AuthenticatedUser = {
  sub: string
  email: string
  emailVerified: boolean
  role: UserRole
}

export class ErrandServiceError extends Error {
  constructor(
    public readonly code: ErrandErrorCode,
    message: string,
    public readonly statusCode = 500,
    public readonly fieldErrors?: Record<string, string>,
  ) {
    super(message)
    this.name = 'ErrandServiceError'
  }
}
