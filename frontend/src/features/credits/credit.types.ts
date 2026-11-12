/*
 * AI Assistance Disclosure
 * Tool: Anthropic Claude (model unrecorded), date: 2026-11-10
 * Scope (AI-62): Added type definitions for wallet balance and credit transaction history.
 * Author review: Code changes were checked and validated
 */

export type WalletBalanceResponse = {
  availableBalance: number
}

export type CreditTransactionType = 'RESERVED' | 'RELEASED' | 'TRANSFERRED' | 'RECEIVED'

export type CreditTransaction = {
  transactionId: string
  orderId: string | null
  type: CreditTransactionType
  description: string
  amount: number
  balanceAfter: number
  occurredAt: string
}

export type CreditHistoryPage = {
  items: CreditTransaction[]
  number: number
  size: number
  totalElements: number
  totalPages: number
}

/**
 * Raw Spring Data `Page` JSON. Depending on the serialization mode, page metadata
 * is either at the top level (DIRECT) or nested under `page` (VIA_DTO).
 */
export type SpringPageResponse<T> = {
  content: T[]
  number?: number
  size?: number
  totalElements?: number
  totalPages?: number
  page?: {
    number: number
    size: number
    totalElements: number
    totalPages: number
  }
}
