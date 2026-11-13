/*
 * AI Assistance Disclosure:
 * Tool: ChatGPT (model: GPT-6 Sol), date: 2026-10-17
 * Scope: Generated implementation of helper functions for transaction history display
 * Author review: Verified correctness.
 */
import type { TransactionRecord } from '@relay/contracts'

export const HISTORY_PAGE_SIZE = 10
export const HISTORY_BATCH_SIZE = 100

export function transactionDisplay(record: TransactionRecord, userId: string) {
  switch (record.type) {
    case 'CREDIT_TRANSFER':
      return record.receiverId === userId
        ? { type: 'Incoming transfer', amount: `+${record.amount} cr`, tone: 'incoming' }
        : { type: 'Outgoing transfer', amount: `-${record.amount} cr`, tone: 'outgoing' }
    case 'CREDIT_RESERVE':
      return { type: 'Credit reserve', amount: `-${record.amount} cr`, tone: 'neutral' }
    case 'CREDIT_RELEASE':
      return { type: 'Credit release', amount: `+${record.amount} cr`, tone: 'neutral' }
    case 'INITIAL_ALLOCATION':
      return { type: 'Initial allocation', amount: `+${record.amount} cr`, tone: 'neutral' }
    case 'USER_DELETION':
      return { type: 'User deletion', amount: `-${record.amount} cr`, tone: 'neutral' }
  }
}

export function transactionTime(time: Date): string {
  const date = new Date(time)
  return Number.isNaN(date.getTime()) ? String(time) : date.toLocaleString()
}
