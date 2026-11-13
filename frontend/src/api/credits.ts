import type { CreditActivityItem, CreditOperationType, CreditWallet } from '../credits/creditTypes'
import { request } from './client'

interface WalletDto {
  user_id: string
  available_credits: number
  reserved_credits: number
  updated_at?: string
}

interface TransactionDto {
  id: string
  user_id: string
  order_id: string | null
  type: string
  amount: number
  created_at: string
}

const operationTypes: CreditOperationType[] = ['RESERVE', 'RELEASE', 'DEDUCT', 'CREDIT', 'INITIAL']

const descriptions: Record<CreditOperationType, string> = {
  RESERVE: 'Credits reserved for an order.',
  RELEASE: 'Reserved credits returned.',
  DEDUCT: 'Reserved credits paid out for a completed delivery.',
  CREDIT: 'Credits earned from a completed delivery.',
  INITIAL: 'Initial credits granted when the account was created.',
}

// Reserve moves credits out of available; release moves them back; deduct only
// reduces the reserved balance; credit adds to the courier's available balance.
const signedMultiplier: Record<CreditOperationType, number> = {
  RESERVE: -1,
  RELEASE: 1,
  DEDUCT: -1,
  CREDIT: 1,
  INITIAL: 1,
}

function toWallet(dto: WalletDto): CreditWallet {
  return {
    userId: dto.user_id,
    totalCredits: dto.available_credits + dto.reserved_credits,
    availableCredits: dto.available_credits,
    reservedCredits: dto.reserved_credits,
    updatedAt: dto.updated_at ?? '',
  }
}

function toActivity(dto: TransactionDto): CreditActivityItem {
  const type = dto.type as CreditOperationType
  const known = operationTypes.includes(type)
  return {
    id: dto.id,
    operationType: type,
    amount: dto.amount,
    signedAmount: dto.amount * (known ? signedMultiplier[type] : 1),
    orderId: dto.order_id,
    description: known ? descriptions[type] : 'Credit activity.',
    status: 'completed',
    createdAt: dto.created_at,
  }
}

export async function fetchMyWallet(userId: string): Promise<CreditWallet> {
  const response = await request(`/credit/wallet/${encodeURIComponent(userId)}`)
  return toWallet((await response.json()) as WalletDto)
}

export async function fetchMyCreditActivity(userId: string): Promise<CreditActivityItem[]> {
  const response = await request(`/credit/tx/${encodeURIComponent(userId)}`)
  return ((await response.json()) as TransactionDto[]).map(toActivity)
}
