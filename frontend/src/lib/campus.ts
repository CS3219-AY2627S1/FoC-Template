/**
 * AI Assistance Disclosure
 * Tool: Claude Code (Claude Opus 5.5), date: 2026-11-01
 * Scope: Generated the NUS campus boundary and the on-campus check.
 * Reviewed by Ngooi Jun Sen.
 *
 * The app only serves NUS, so supplier coordinates must fall on campus and a
 * courier's location only counts for ranking when it does. Browser locations
 * are self-reported, so this is a sanity check, not a security control; the
 * services still need their own check before it is enforced.
 *
 * Rough outlines traced from OpenStreetMap, generous enough that indoor
 * positioning error (often 20-100 m) does not reject someone at the edge of
 * campus, at the cost of letting in a little of West Coast and Science Park.
 */

import type { Coordinates } from './useGeolocation';

interface CampusArea {
  name: string;
  /** Corners as [latitude, longitude], in order around the outline. */
  outline: readonly (readonly [number, number])[];
}

/**
 * Kent Ridge only for now. The north edge follows the Ayer Rajah Expressway
 * from Clementi to Buona Vista, except for a notch up Clementi Road to Dover
 * Road that keeps UTown, which sits on the far side of it.
 */
export const NUS_CAMPUS_AREAS: readonly CampusArea[] = [
  {
    name: 'Kent Ridge',
    outline: [
      [1.308, 103.766], // Clementi, where the AYE meets the west edge
      [1.3041, 103.7712], // University Flyover
      [1.3095, 103.7717], // up Clementi Road to Dover Road
      [1.3087, 103.775], // along Dover Road, past UTown's bus stop
      [1.3023, 103.775], // back down to the AYE
      [1.2962, 103.7845], // along the AYE, north of NUH
      [1.2939, 103.7859], // Buona Vista Flyover
      [1.2925, 103.788], // the AYE at the east edge
      [1.288, 103.788], // south of Kent Ridge MRT
      [1.288, 103.766], // West Coast
    ],
  },
];

/** Ray casting: count how many edges a ray east from the point crosses. */
function insideOutline(latitude: number, longitude: number, outline: CampusArea['outline']): boolean {
  let inside = false;
  for (let i = 0, j = outline.length - 1; i < outline.length; j = i++) {
    const [latI, lngI] = outline[i];
    const [latJ, lngJ] = outline[j];
    if (
      latI > latitude !== latJ > latitude &&
      longitude < ((lngJ - lngI) * (latitude - latI)) / (latJ - latI) + lngI
    ) {
      inside = !inside;
    }
  }
  return inside;
}

export function isOnCampus({ latitude, longitude }: Coordinates): boolean {
  return NUS_CAMPUS_AREAS.some((area) => insideOutline(latitude, longitude, area.outline));
}
