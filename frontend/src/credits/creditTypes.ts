// Credit view models, mapped from Credit Service responses in api/credits.ts.

export type CreditOperationType =
  | 'RESERVE'
  | 'RELEASE'
  | 'DEDUCT'
  | 'CREDIT'
  | 'INITIAL'
export interface CreditWallet {
  userId: string
  /** Total credits on the account, as reported by Credit Service. */
  totalCredits: number
  /** Credits free to spend on new orders. */
  availableCredits: number
  /** Credits held for open / accepted orders. */
  reservedCredits: number
  updatedAt: string
}

export interface CreditActivityItem {
  id: string
  operationType: CreditOperationType
  amount: number
  /** Positive = credits added to this wallet; negative = credits removed/held. */
  signedAmount: number
  orderId: string | null
  description: string
  status: 'completed' | 'pending' | 'failed'
  createdAt: string
}

export const creditOperationDisplay: Record<
  CreditOperationType,
  { label: string; color: 'default' | 'primary' | 'secondary' | 'success' | 'warning' | 'info' }
> = {
  RESERVE: { label: 'Reserved for order', color: 'warning' },
  RELEASE: { label: 'Released', color: 'info' },
  DEDUCT: { label: 'Paid for delivery', color: 'secondary' },
  CREDIT: { label: 'Earned from delivery', color: 'success' },
  INITIAL: { label: 'Welcome credits', color: 'primary' },
}

export function formatCreditAmount(amount: number): string {
  return `${amount} ${amount === 1 ? 'credit' : 'credits'}`
}

export function formatOrderRef(orderId: string | null): string {
  if (!orderId) return '—'
  return `#${orderId.slice(0, 8).toUpperCase()}`
}
