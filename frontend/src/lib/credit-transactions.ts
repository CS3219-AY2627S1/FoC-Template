export type CreditTransactionType =
  | "INITIAL_ALLOCATION"
  | "RESERVATION"
  | "PAID"
  | "RECEIVED"
  | "REFUNDED_CANCELLATION"
  | "REFUNDED_EXPIRY"
  | "REFUNDED"

export type CreditTransaction = {
  transactionId: string
  type: CreditTransactionType
  amount: number
  direction: "CREDIT" | "DEBIT"
  occurredAt: string
  orderId: string | null
}

export type CreditTransactionPage = {
  items: CreditTransaction[]
  page: number
  size: number
  totalItems: number
  totalPages: number
}

export const CREDIT_TRANSACTION_LABELS: Record<CreditTransactionType, string> = {
  INITIAL_ALLOCATION: "Initial allocation",
  RESERVATION: "Reserved",
  PAID: "Paid",
  RECEIVED: "Received",
  REFUNDED_CANCELLATION: "Refunded (order cancelled)",
  REFUNDED_EXPIRY: "Refunded (order expired)",
  REFUNDED: "Refunded",
}
