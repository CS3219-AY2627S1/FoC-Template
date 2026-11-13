import type { OrderState } from '../api/orderApi'
import { reservationFailure, stateLabel } from '../utils/orderFormatting'

export function StateBadge({ state, terminalReason = null }: { state: OrderState; terminalReason?: string | null }) {
  // A credit timeout ends the errand before it is posted, so it reads like a refused reservation.
  const label =
    state === 'RESERVATION_FAILED'
      ? reservationFailure(terminalReason).label
      : state === 'EXPIRED' && terminalReason === 'CREDIT_RESERVATION_TIMEOUT'
        ? 'Not posted'
        : stateLabel(state)
  return <span className={`badge badge-${state.toLowerCase()}`}>{label}</span>
}
