import type { CreditBalance, TransactionRecord } from './models'

export type ViewCreditResponse = CreditBalance

export type ViewCreditHistoryResponse = {
  /** Up to 100 records, newest first, beginning after the requested offset. */
  records: Array<TransactionRecord>
}

export type ReserveCreditResponse = CreditBalance & {
  status: 'RESERVE_SUCCESS'
}
