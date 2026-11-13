// AI-assisted (Claude Opus 5.5), 2026-11-12: show the pickup building instead of raw coordinates; see ui/ai-usage/usage-log.md, entry 002
import { useEffect, useState } from "react"
import type { Order } from "../App"
import { getSupplier, supplierLocation } from "../api/suppliers"

// order-service saves the pickup as "lat, lng", which means nothing to a
// courier, so look up the supplier's building and floor instead.
// Cached per supplier so a list of orders doesn't refetch the same one.
const cache = new Map<string, Promise<string | null>>()

function lookup(supplierId: string) {
  if (!cache.has(supplierId)) {
    const place = getSupplier(Number(supplierId))
      .then((s) => [supplierLocation(s), s.locationDescription].filter(Boolean).join(" · "))
      .catch(() => {
        cache.delete(supplierId) // try again next time
        return null
      })
    cache.set(supplierId, place)
  }
  return cache.get(supplierId)!
}

const COORDS = /^\s*(-?\d+(\.\d+)?)\s*,\s*(-?\d+(\.\d+)?)\s*$/

export const isCoordinates = (text: string) => COORDS.test(text)

export function mapsLink(pickupLocation: string) {
  const match = pickupLocation.match(COORDS)
  return match ? `https://www.google.com/maps/search/?api=1&query=${match[1]},${match[3]}` : null
}

// building name if we can get it, otherwise whatever order-service gave us
// (as long as it isn't coordinates)
export function usePickupPlace(order: Pick<Order, "supplierId" | "pickupLocation">) {
  const fallback = isCoordinates(order.pickupLocation) ? "" : order.pickupLocation
  const [place, setPlace] = useState(fallback)

  useEffect(() => {
    if (!order.supplierId) return
    let stale = false
    lookup(order.supplierId).then((found) => { if (!stale && found) setPlace(found) })
    return () => { stale = true }
  }, [order.supplierId])

  return place
}
