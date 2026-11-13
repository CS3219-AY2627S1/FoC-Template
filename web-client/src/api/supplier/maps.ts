// Links into Google Maps. A Maps URL needs no API key, and a phone with the Google Maps app opens it
// there. Format from https://developers.google.com/maps/documentation/urls/get-started

// Anything that may have a place on the map: a supplier, or the delivery location of an errand.
export type MapPlace = {
  latitude: number | null
  longitude: number | null
}

export type TravelMode = 'walking' | 'bicycling' | 'driving' | 'transit'

type Coordinates = { latitude: number; longitude: number }

function coordinatesOf({ latitude, longitude }: MapPlace): Coordinates | null {
  return latitude !== null && longitude !== null && Number.isFinite(latitude) && Number.isFinite(longitude)
    ? { latitude, longitude }
    : null
}

const asText = ({ latitude, longitude }: Coordinates) => `${latitude},${longitude}`

// The supplier as a pin. null when it has no coordinates.
export function supplierMapUrl(supplier: MapPlace): string | null {
  const point = coordinatesOf(supplier)
  if (!point) return null
  return `https://www.google.com/maps/search/?${new URLSearchParams({ api: '1', query: asText(point) })}`
}

// The route of an errand: from the supplier, where the runner picks up, to the delivery location.
// null unless both have coordinates, so a route button is only clickable when the route is exact.
// From an errand page, with the supplier from useSupplier(errand.supplierId):
//   pickupRouteUrl(supplier, { latitude: errand.deliveryLatitude, longitude: errand.deliveryLongitude })
export function pickupRouteUrl(supplier: MapPlace, delivery: MapPlace, mode: TravelMode = 'walking'): string | null {
  const from = coordinatesOf(supplier)
  const to = coordinatesOf(delivery)
  if (!from || !to) return null
  const query = new URLSearchParams({ api: '1', origin: asText(from), destination: asText(to), travelmode: mode })
  return `https://www.google.com/maps/dir/?${query}`
}
