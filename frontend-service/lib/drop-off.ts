import type { DeliveryLocation, Order } from '@/lib/order-service';

/** A point on the map. */
export type LatLng = { latitude: number; longitude: number };

/**
 * The area Order Service accepts deliveries in (`NUS_CAMPUS_BOUNDS`). Pins
 * outside it would be rejected, so the map refuses them up front.
 */
export const CAMPUS_BOUNDS = {
  minLatitude: 1.288,
  maxLatitude: 1.31,
  minLongitude: 103.75,
  maxLongitude: 103.788,
};

export const CAMPUS_CENTER: LatLng = { latitude: 1.2966, longitude: 103.7737 };

export function isOnCampus({ latitude, longitude }: LatLng) {
  const b = CAMPUS_BOUNDS;
  return (
    b.minLatitude <= latitude &&
    latitude <= b.maxLatitude &&
    b.minLongitude <= longitude &&
    longitude <= b.maxLongitude
  );
}

/**
 * Campus buildings offered as quick picks. They also name map pins until the
 * OSM lookup returns (see `lookUpPlaceName`), or when it finds no name, since
 * Order Service needs a label for every drop-off.
 */
export type DropOffPoint = LatLng & { id: string; label: string };

export const DROP_OFF_POINTS: DropOffPoint[] = [
  { id: 'com1', label: 'COM1', latitude: 1.2949, longitude: 103.7737 },
  { id: 'com2', label: 'COM2', latitude: 1.2938, longitude: 103.7745 },
  {
    id: 'clb',
    label: 'Central Library',
    latitude: 1.2966,
    longitude: 103.773,
  },
  {
    id: 'yih',
    label: 'Yusof Ishak House',
    latitude: 1.2984,
    longitude: 103.7726,
  },
  {
    id: 'hssml',
    label: 'Hon Sui Sen Memorial Library',
    latitude: 1.2931,
    longitude: 103.772,
  },
  {
    id: 'e4',
    label: 'Engineering Block E4',
    latitude: 1.2992,
    longitude: 103.7691,
  },
  {
    id: 'medsci',
    label: 'Medicine+Science Library',
    latitude: 1.2968,
    longitude: 103.7794,
  },
  {
    id: 'pgp',
    label: "Prince George's Park Residences",
    latitude: 1.2909,
    longitude: 103.7771,
  },
  {
    id: 'utown',
    label: 'University Town',
    latitude: 1.3048,
    longitude: 103.7727,
  },
];

/** Pins this close to a building take its name instead of "Near …". */
const SAME_PLACE_METRES = 40;

/** Approximate distance in metres; accurate enough across one campus. */
function distanceMetres(a: LatLng, b: LatLng) {
  const metresPerDegree = 111_320;
  const dLat = (a.latitude - b.latitude) * metresPerDegree;
  const dLng =
    (a.longitude - b.longitude) *
    metresPerDegree *
    Math.cos((a.latitude * Math.PI) / 180);
  return Math.hypot(dLat, dLng);
}

/** A fallback label for a pin, named after the closest building. */
export function labelFor(position: LatLng) {
  let nearest = DROP_OFF_POINTS[0];
  for (const point of DROP_OFF_POINTS) {
    if (distanceMetres(position, point) < distanceMetres(position, nearest)) {
      nearest = point;
    }
  }
  return distanceMetres(position, nearest) <= SAME_PLACE_METRES
    ? nearest.label
    : `Near ${nearest.label}`;
}

/** The quick pick exactly at `position`, if any. */
export function presetAt(position: LatLng | null) {
  return position
    ? DROP_OFF_POINTS.find(
        (p) =>
          p.latitude === position.latitude &&
          p.longitude === position.longitude,
      )
    : undefined;
}

/** Drop-off form state: the pin, its label and the free-text details. */
export type DropOffValue = {
  position: LatLng | null;
  label: string;
  details: string;
};

export const EMPTY_DROP_OFF: DropOffValue = {
  position: null,
  label: '',
  details: '',
};

/** Moves the pin, renaming it after the building it is now at or near. */
export function pinDropOff(value: DropOffValue, position: LatLng) {
  const preset = presetAt(position);
  return { ...value, position, label: preset?.label ?? labelFor(position) };
}

/**
 * The requester's own drop-off details, or null when they gave none. Order
 * Service requires non-blank details, so an order without any stores the
 * label again (see `toDeliveryLocation`).
 */
export function deliveryDetailsOf(label: string, details: string) {
  return details === label ? null : details;
}

/** An order's current drop-off as form state, keeping its pin and label. */
export function dropOffValueOf(
  order: Pick<
    Order,
    | 'delivery_label'
    | 'delivery_latitude'
    | 'delivery_longitude'
    | 'delivery_details'
  >,
): DropOffValue {
  return {
    position: {
      latitude: order.delivery_latitude,
      longitude: order.delivery_longitude,
    },
    label: order.delivery_label,
    details:
      deliveryDetailsOf(order.delivery_label, order.delivery_details) ?? '',
  };
}

/**
 * The Order Service body for a drop-off, or null until a pin is placed on
 * campus. A cleared label falls back to the nearest building. Details are
 * optional here but required by Order Service, so blank details fall back to
 * the label.
 */
export function toDeliveryLocation({
  position,
  label,
  details,
}: DropOffValue): DeliveryLocation | null {
  if (!position || !isOnCampus(position)) return null;
  const name = label.trim() || labelFor(position);
  return { label: name, ...position, details: details.trim() || name };
}
