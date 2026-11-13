import type { TransactionReference } from './models'

export type AllocateInitialCreditCommand = {
  transactionReference: TransactionReference
  userId: string
}

export type DeleteUserCreditCommand = {
  transactionReference: TransactionReference
  userId: string
}

export type ReleaseCreditCommand = {
  transactionReference: TransactionReference
  userId: string
  amount: number
}

export type TransferCreditCommand = {
  transactionReference: TransactionReference
  senderId: string
  receiverId: string
  amount: number
}
