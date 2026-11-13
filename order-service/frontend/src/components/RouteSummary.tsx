import { CircleDot, MapPin } from 'lucide-react'
import type { Order } from '../api/orderApi'
import { locationName } from '../utils/orderFormatting'

export function RouteSummary({ order }: { order: Order }) {
  return (
    <ul aria-label="Route" className="route">
      <li>
        <CircleDot aria-hidden="true" className="pin" />
        <div>
          <small>Pick up</small>
          <span>{locationName(order.pickupLocationName)}</span>
        </div>
      </li>
      <li>
        <MapPin aria-hidden="true" className="pin" />
        <div>
          <small>Drop off</small>
          <span>{locationName(order.dropoffLocationName)}</span>
        </div>
      </li>
    </ul>
  )
}
