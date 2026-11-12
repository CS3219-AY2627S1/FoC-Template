import { useContext } from 'react'
import { CreditContext } from './credit.context'

export function useCredits() {
  const context = useContext(CreditContext)

  if (!context) throw new Error('useCredits must be used within a CreditProvider')
  return context
}
