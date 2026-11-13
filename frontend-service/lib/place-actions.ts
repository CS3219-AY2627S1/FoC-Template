'use server';

import type { LatLng } from '@/lib/drop-off';
import { placeNameAt } from '@/lib/place-name';
import { getSessionToken } from '@/lib/session';

/**
 * The OSM name of a dropped pin, or null to keep the fallback label. Only
 * signed-in users may look up names, so the action is not an open proxy.
 */
export async function lookUpPlaceName(position: LatLng) {
  const { latitude, longitude } = position ?? {};
  if (typeof latitude !== 'number' || typeof longitude !== 'number') {
    return null;
  }
  if (!(await getSessionToken())) return null;
  return placeNameAt({ latitude, longitude });
}
