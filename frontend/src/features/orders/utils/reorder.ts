import { EXPIRY_MINUTES } from '../schemas/createErrand.schema'
import type { CreateErrandValues } from '../schemas/createErrand.schema'
import type { PickupSelection } from '#/features/suppliers/components/PickupLocationPicker/PickupLocationPicker'
import type { Errand } from '../types/errand.types'

/**
 * get info from past errand. the pickup location will be left empty if the supplier is no longer
 * listed, so the requester could choose another location instead of get rejected after posting
 */
export const reorderValues = (
  order: Errand,
  pickupLocations: Array<PickupSelection>,
): CreateErrandValues => {
  const minutesOpen =
    (Date.parse(order.expiresAt) - Date.parse(order.createdAt)) / 60_000
  return {
    pickup:
      pickupLocations.find((location) => location.id === order.supplierId) ??
      null,
    deliveryLocation: order.deliveryLocation,
    description: order.description,
    notes: order.notes,
    creditReward: order.creditReward,
    // the errand will keep open before the expiry time
    expiryMinutes:
      EXPIRY_MINUTES.find((minutes) => minutes >= minutesOpen) ??
      EXPIRY_MINUTES[EXPIRY_MINUTES.length - 1],
  }
}

const normalise = (value: string) =>
  value.trim().replace(/\s+/g, ' ').toLowerCase()

// check if the user posted same errand req, if yes then show the alert
export const findSameActiveRequest = (
  values: CreateErrandValues,
  active: Array<Errand>,
) =>
  active.find(
    (order) =>
      order.supplierId === values.pickup?.id &&
      normalise(order.description) === normalise(values.description) &&
      normalise(order.deliveryLocation) === normalise(values.deliveryLocation),
  )
