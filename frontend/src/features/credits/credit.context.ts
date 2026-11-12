import { createContext } from 'react'

export type CreditStatus = 'loading' | 'ready' | 'error'

export type CreditContextValue = {
  availableBalance: number | null
  status: CreditStatus
  error: string | null
  refreshBalance: () => Promise<void>
}

export const CreditContext = createContext<CreditContextValue | null>(null)
