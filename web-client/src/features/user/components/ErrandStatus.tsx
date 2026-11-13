import { useAdminOrder } from '@/api/order/order'
import type { OrderStatus } from '@/api/order/order'

const STATUS_LABEL: Record<OrderStatus, string> = {
  Pending: 'Pending',
  Open: 'Open',
  Accepted: 'Accepted',
  PickedUp: 'Picked up',
  Delivered: 'Delivered',
  Completed: 'Completed',
  Cancelled: 'Cancelled',
  Expired: 'Expired',
}

const BADGE_CLASS: Record<OrderStatus, string> = {
  Pending: 'ds-badge ds-badge--neutral',
  Open: 'ds-badge ds-badge--info',
  Accepted: 'ds-badge ds-badge--info',
  PickedUp: 'ds-badge ds-badge--info',
  Delivered: 'ds-badge ds-badge--info',
  Completed: 'ds-badge ds-badge--success',
  Cancelled: 'ds-badge ds-badge--neutral',
  Expired: 'ds-badge ds-badge--neutral',
}


// To inform admin of a particular errand status
export function ErrandStatus({ errandId }: { errandId: string }) {
  const id = Number(errandId)
  const order = useAdminOrder(Number.isInteger(id) ? id : 0)
  if (!order.data) return null
  const status = order.data.status
  return (
    <span className={`rounded-chip px-3 py-0.5 text-xs font-[600] ${BADGE_CLASS[status]}`}>
      {STATUS_LABEL[status]}
    </span>
  )
}