/**
 * AI Assistance Disclosure
 * Tool: Claude Code (Claude Opus 5.5), date: 2026-11-02
 * Scope: Generated the Order Service delivery point calls the new request
 *        form uses for its drop-off picker.
 * Reviewed by Ngooi Jun Sen.
 *
 * Drop-offs belong to Order, not to the supplier catalogue: a seeded list of
 * campus points (COM1 lobby, UTown and so on), plus the places this user has
 * delivered to before. A new order names one by `deliveryPointId`, or
 * describes a new place inline; Order saves that place to my-locations once
 * the order succeeds. There is no way to save a place without an order.
 */

import { api } from './api';
import { isOnCampus } from './campus';
import { distanceMetres } from './orders';
import type { Coordinates } from './useGeolocation';

export interface DeliveryPoint {
  id: number;
  /** Set on campus points only; null on the user's own places. */
  code: string | null;
  name: string;
  building: string | null;
  description: string | null;
  latitude: number;
  longitude: number;
  /** The user's own label for a place they have used; my-locations only. */
  nickname: string | null;
  /** How many of the user's orders went here; my-locations only. */
  useCount: number | null;
}

interface DeliveryPointPage {
  content: DeliveryPoint[];
  page: number;
  size: number;
  totalElements: number;
}

/** Order's largest page; the seeded campus list is well under it. */
const PAGE_SIZE = 100;

/** The campus catalogue: the seeded points every user can pick. */
export async function fetchCampusDeliveryPoints(): Promise<DeliveryPoint[]> {
  const result = await api.get<DeliveryPointPage>(`/orders/delivery-points?page=0&size=${PAGE_SIZE}`);
  return result.content;
}

/** Places this user has delivered to before, most used first. */
export async function fetchMyDeliveryPoints(): Promise<DeliveryPoint[]> {
  const result = await api.get<DeliveryPointPage>(
    `/orders/delivery-points/my-locations?page=0&size=${PAGE_SIZE}`,
  );
  return result.content;
}

/**
 * How a point reads in a picker: its name, after the user's nickname if they
 * gave one. Names already say the building ("Central Library bus stop"), so
 * the building is left to the hint under the field.
 */
export function deliveryPointLabel(point: DeliveryPoint): string {
  const nickname = point.nickname?.trim();
  return nickname ? `${nickname} (${point.name})` : point.name;
}

/** Where exactly, for the hint under the picker and on the order pages: building and description. */
export function deliveryPointDetail(
  point: Pick<DeliveryPoint, 'name' | 'building' | 'description'>,
): string | null {
  const parts = [point.building, point.description].filter(
    (part): part is string => part !== null && part.trim() !== '' && part !== point.name,
  );
  return parts.length > 0 ? parts.join(' · ') : null;
}

/** What PATCH /delivery-points/{id} may change; omitted fields are left alone. */
export interface DeliveryPointChanges {
  name?: string;
  building?: string;
  description?: string;
  latitude?: number;
  longitude?: number;
  /** An empty string clears it. */
  nickname?: string;
}

/**
 * Order never edits a campus point or a place someone else also uses: it
 * saves the user's own copy instead, so the point returned may have a new id.
 * A nickname alone never copies.
 */
export async function updateDeliveryPoint(id: number, changes: DeliveryPointChanges): Promise<DeliveryPoint> {
  return api.patch<DeliveryPoint>(`/orders/delivery-points/${id}`, changes);
}

/** Takes the place off this user's list. Past orders keep their copy of it. */
export async function deleteDeliveryPoint(id: number): Promise<void> {
  await api.delete<void>(`/orders/delivery-points/${id}`);
}

/**
 * Order's own check on a new place is this box (order.delivery-points in its
 * application.yml). Our campus outline sits inside it except at the Dover
 * Road corner, so a place has to pass both.
 */
const ORDER_BOUNDS = { minLat: 1.288, maxLat: 1.309, minLng: 103.766, maxLng: 103.788 };

export function isAllowedDropoff(point: Coordinates): boolean {
  return (
    point.latitude >= ORDER_BOUNDS.minLat &&
    point.latitude <= ORDER_BOUNDS.maxLat &&
    point.longitude >= ORDER_BOUNDS.minLng &&
    point.longitude <= ORDER_BOUNDS.maxLng &&
    isOnCampus(point)
  );
}

/** Within this, a location counts as being at a known point rather than a new place. */
export const SNAP_METRES = 25;

/** The closest of `points` within SNAP_METRES, with its distance; null if none is that close. */
export function nearbyDeliveryPoint(
  from: Coordinates,
  points: DeliveryPoint[],
): { point: DeliveryPoint; metres: number } | null {
  let best: { point: DeliveryPoint; metres: number } | null = null;
  for (const point of points) {
    const metres = distanceMetres(from, point);
    if (metres <= SNAP_METRES && (best === null || metres < best.metres)) best = { point, metres };
  }
  return best;
}
