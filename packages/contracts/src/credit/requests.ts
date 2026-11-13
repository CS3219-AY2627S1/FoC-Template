import type { TransactionReference } from './models'

export type ViewCreditRequest = {
  userId: string
}

export type ViewCreditHistoryRequest = {
  userId: string
  /** Number of newest records to skip. Responses contain at most 100 records. */
  offset: number
}

export type ReserveCreditRequest = {
  transactionReference: TransactionReference
  userId: string
  amount: number
}
