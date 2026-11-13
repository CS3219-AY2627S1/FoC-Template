import type { useCreditBalance } from '#/features/credits/hooks/useCreditBalance'
import { getApiErrorCode } from '#/lib/httpErrors'

export const getBalanceLabel = (
  balance: ReturnType<typeof useCreditBalance>,
) => {
  if (balance.isPending) return 'Loading credits…'
  if (getApiErrorCode(balance.error) === 'CREDIT_ACCOUNT_PENDING') {
    return 'Credit account preparing'
  }
  if (balance.isError) return 'Balance unavailable'
  return `${balance.data.availableBalance} credits`
}

export const getAccountInitials = (name: string) =>
  name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase() || '?'
