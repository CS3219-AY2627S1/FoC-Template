import { ArrowRight, MapPin } from 'lucide-react'
import type { Order } from '../api/orderApi'
import { locationName } from '../utils/orderFormatting'

/** "Pickup → Drop-off" on list cards; screen readers hear "to" rather than an arrow. */
export function RouteLine({ order }: { order: Order }) {
  return (
    <p className="route-line">
      <MapPin aria-hidden="true" className="route-pin" />
      <span>{locationName(order.pickupLocationName)}</span>
      <ArrowRight aria-hidden="true" />
      <span className="visually-hidden"> to </span>
      <span>{locationName(order.dropoffLocationName)}</span>
    </p>
  )
}
