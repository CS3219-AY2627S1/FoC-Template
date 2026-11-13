import { MapPin } from 'lucide-react'
import type { Order } from '@/api/order/order'
import { pickupRouteUrl } from '@/api/supplier/maps'
import { WalkSummary } from './WalkSummary'

// The walk the order-service stored when the errand was posted, and a link that shows the route in
// Google Maps. The link is only there when both ends are known, so it never shows a guessed route.
export function WalkingRoute({ order }: { order: Order }) {
  const href = pickupRouteUrl(
    { latitude: order.pickup_latitude, longitude: order.pickup_longitude },
    { latitude: order.delivery_latitude, longitude: order.delivery_longitude },
  )
  const { route_metres: metres, route_seconds: seconds, route_estimated: estimated } = order

  return (
    <div className="grid grid-cols-1 gap-2">
      {metres !== null && seconds !== null ? (
        <WalkSummary walk={{ metres, seconds, estimated: estimated === true }} />
      ) : (
        <p className="text-muted">The walk could not be measured when this errand was posted.</p>
      )}
      {href && (
        <a href={href} target="_blank" rel="noopener noreferrer" className="ds-btn ds-btn--glass justify-self-start">
          <MapPin aria-hidden="true" className="size-5 shrink-0" />
          Route in Google Maps
          <span className="sr-only"> (opens in a new tab)</span>
        </a>
      )}
    </div>
  )
}
