/**
 * AI Assistance Disclosure
 * Tool: Cursor (GPT-5.6 Sol Medium)
 * Scope: Assisted with frontend implementation, debugging and UI refinement.
 * Author review: The generated code was reviewed, tested, and iteratively refined by the author through follow-up instructions.
 */

import { Chip } from '@mui/material'
import { orderStatusDisplay, type OrderStatus } from '../orders/orderTypes'

type OrderStatusChipProps = {
  status: OrderStatus
  size?: 'small' | 'medium'
}

function OrderStatusChip({ status, size = 'small' }: OrderStatusChipProps) {
  const display = orderStatusDisplay[status]

  return (
    <Chip
      size={size}
      label={display.label}
      color={display.color}
      variant={display.color === 'default' ? 'outlined' : 'filled'}
      sx={{ fontWeight: 650 }}
    />
  )
}

export default OrderStatusChip
