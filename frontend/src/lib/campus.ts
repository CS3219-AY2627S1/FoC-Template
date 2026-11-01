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
 * Rough boxes, not polygons: generous enough that indoor positioning error
 * (often 20-100 m) does not reject someone at the edge of campus, at the cost
 * of letting in a little of Clementi Road and Science Park.
 *
 * The seed data (data/csv/supplier-seed-data.csv) is the authority: every row
 * must fall inside. Its westernmost row, Cheers at E3, is listed at
 * 103.7526, so the west edge sits just past it.
 */

import type { Coordinates } from './useGeolocation';

interface CampusArea {
  name: string;
  south: number;
  north: number;
  west: number;
  east: number;
}

/** Kent Ridge only for now: UTown and Kent Vale to Kent Ridge MRT and NUH. */
export const NUS_CAMPUS_AREAS: readonly CampusArea[] = [
  { name: 'Kent Ridge', south: 1.288, north: 1.308, west: 103.751, east: 103.788 },
];

export function isOnCampus({ latitude, longitude }: Coordinates): boolean {
  return NUS_CAMPUS_AREAS.some(
    (area) =>
      latitude >= area.south &&
      latitude <= area.north &&
      longitude >= area.west &&
      longitude <= area.east,
  );
}
