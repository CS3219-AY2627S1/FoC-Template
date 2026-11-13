// IMPORTANT: Do not change transaction reference, db will rely on this for idempotency
export type TransactionType =
  'INITIAL_ALLOCATION' | 'CREDIT_RESERVE' | 'CREDIT_RELEASE' | 'CREDIT_TRANSFER' | 'USER_DELETION'

export type TransactionReference = {
  service: string
  id: string
  type: TransactionType
}

export type TransactionReferenceKey = `${string}:${string}:${TransactionType}`

export function convertTransactionReferenceToKey(
  ref: TransactionReference,
): TransactionReferenceKey {
  return `${ref.service}:${ref.id}:${ref.type}`
}

export function convertTransactionKeyToReference(
  ref: TransactionReferenceKey,
): TransactionReference {
  return {
    service: ref.split(':')[0],
    id: ref.split(':')[1],
    type: ref.split(':')[2] as TransactionType,
  }
}

export type CreditBalance = {
  userId: string
  availableCredit: number
  reserveCredit: number
  lastUpdated: Date
}

export type TransactionRecord = {
  reference: TransactionReference
  time: Date
  senderId: string
  receiverId: string
  type: TransactionType
  amount: number
}
