import type { ReviewAction } from '../../api/orderOperations'
import type { Order } from '../orders/models'

export type Decision = { order: Order; action: ReviewAction; caseId: string; requestId: string }
export type DecisionState = { status: 'closed' }
  | (Decision & { status: 'editing'; reason: string })
  | (Decision & { status: 'submitting' | 'uncertain'; reason: string; error: string })
export type DecisionEvent = { type: 'choose'; decision: Decision } | { type: 'edit'; reason: string }
  | { type: 'submit' } | { type: 'failed'; error: string } | { type: 'close' } | { type: 'accepted' }

// After sending, freeze both the reason and request ID: a failed HTTP response
// does not prove the server rejected the command. Retry the identical intent.
export const decisionReducer = (state: DecisionState, event: DecisionEvent): DecisionState => {
  switch (event.type) {
    case 'choose': return state.status === 'submitting' ? state : { ...event.decision, status: 'editing', reason: '' }
    case 'edit': return state.status === 'editing' ? { ...state, reason: event.reason } : state
    case 'submit': return (state.status === 'editing' || state.status === 'uncertain') && state.reason.trim()
      ? { ...state, status: 'submitting', reason: state.reason.trim(), error: '' } : state
    case 'failed': return state.status === 'submitting' ? { ...state, status: 'uncertain', error: event.error } : state
    case 'accepted': return { status: 'closed' }
    case 'close': return state.status === 'submitting' ? state : { status: 'closed' }
  }
}
