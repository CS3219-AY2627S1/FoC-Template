/* AI Assistance Disclosure: OpenAI Codex (GPT-6), 2026-11-09.
 * Scope: Credit balance/history HTTP types for #65. Author review: Reviewed and approved by @phuc. */
export type CreditTransactionType = 'INITIAL_GRANT' | 'RESERVE' | 'CAPTURE_DEBIT' | 'CAPTURE_CREDIT' | 'RELEASE' | 'FORFEIT'

export interface CreditBalance {
  readonly available: number
  readonly reserved: number
  readonly total: number
}

export interface CreditTransaction {
  readonly id: string
  readonly type: CreditTransactionType
  readonly availableDelta: number
  readonly reservedDelta: number
  readonly reservationId: string | null
  readonly orderId: string | null
  readonly createdAt: string
}

export interface CreditTransactionPage {
  readonly items: readonly CreditTransaction[]
  readonly page: number
  readonly size: number
  readonly totalItems: number
}

export interface CreditTransactionQuery {
  readonly from?: string
  readonly to?: string
  readonly page?: number
  readonly size?: number
}
