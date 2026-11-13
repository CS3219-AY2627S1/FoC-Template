import type { CreditTransaction, LedgerEntryType } from '../api/creditApi'

const labels: Record<LedgerEntryType, string> = {
  INITIAL_ALLOCATION: 'Welcome credits',
  RESERVATION_CREATED: 'Reserved for an errand',
  RESERVATION_INCREASED: 'Reservation increased',
  RESERVATION_DECREASED: 'Reservation reduced',
  RESERVATION_RELEASED: 'Reservation released',
  SETTLEMENT_DEBIT: 'Paid to courier',
  SETTLEMENT_CREDIT: 'Earned from errand',
  COMPENSATION_DEBIT: 'Paid to courier for a cancelled errand',
  COMPENSATION_CREDIT: 'Earned from a cancelled errand',
  ADMIN_CORRECTION: 'Adjusted by an admin',
}

export function transactionLabel(type: LedgerEntryType) {
  return labels[type]
}

export function netDelta(transaction: CreditTransaction) {
  return transaction.availableDelta + transaction.reservedDelta
}

export function formatDelta(value: number) {
  if (value === 0) return '0'
  return `${value > 0 ? '+' : ''}${value}`
}

export function formatDate(value: string) {
  return new Intl.DateTimeFormat('en-SG', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value))
}
