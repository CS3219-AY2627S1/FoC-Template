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
 * The outline is NUS's own boundary in OpenStreetMap (the Kent Ridge campus,
 * way 54519165, joined with University Town, way 92357946, and the Kent Vale
 * staff housing, way 713272230, which has a drop-off point), widened by 50 m so
 * GPS error does not reject someone at the edge of campus, then simplified to
 * within a few metres. It replaced a rough hand trace on 2026-11-04 that also
 * took in West Coast and Science Park.
 */

import type { Coordinates } from './useGeolocation';

interface CampusArea {
  name: string;
  /** Corners as [latitude, longitude], in order around the outline. */
  outline: readonly (readonly [number, number])[];
}

/**
 * Kent Ridge only for now. The 50 m margin joins UTown and Kent Vale to the
 * main campus, so it is one outline.
 */
export const NUS_CAMPUS_AREAS: readonly CampusArea[] = [
  {
    name: 'Kent Ridge',
    outline: [
      [1.30225, 103.76640], [1.30198, 103.76641], [1.30180, 103.76647], [1.30004, 103.76749],
      [1.29986, 103.76770], [1.29983, 103.76797], [1.30021, 103.76886], [1.30038, 103.76905],
      [1.30068, 103.76912], [1.30085, 103.76942], [1.30108, 103.76958], [1.30104, 103.76989],
      [1.30007, 103.76964], [1.29605, 103.76939], [1.29484, 103.76935], [1.29448, 103.76953],
      [1.29419, 103.76941], [1.29390, 103.76883], [1.29375, 103.76874], [1.29358, 103.76871],
      [1.29334, 103.76879], [1.29244, 103.76967], [1.29231, 103.76983], [1.29221, 103.77012],
      [1.29200, 103.77037], [1.29193, 103.77294], [1.29171, 103.77295], [1.29150, 103.77311],
      [1.29108, 103.77397], [1.29055, 103.77525], [1.29023, 103.77654], [1.28977, 103.77752],
      [1.28967, 103.77807], [1.28975, 103.77848], [1.28982, 103.77864], [1.29006, 103.77885],
      [1.29031, 103.77924], [1.28943, 103.77991], [1.28931, 103.78005], [1.28925, 103.78031],
      [1.28932, 103.78101], [1.28957, 103.78198], [1.28998, 103.78252], [1.29121, 103.78373],
      [1.29153, 103.78387], [1.29241, 103.78487], [1.29331, 103.78572], [1.29358, 103.78587],
      [1.29375, 103.78591], [1.29410, 103.78588], [1.29522, 103.78519], [1.29669, 103.78415],
      [1.29760, 103.78320], [1.29795, 103.78269], [1.29895, 103.78089], [1.30067, 103.77803],
      [1.30230, 103.77513], [1.30253, 103.77525], [1.30309, 103.77536], [1.30337, 103.77639],
      [1.30349, 103.77651], [1.30365, 103.77657], [1.30390, 103.77655], [1.30410, 103.77639],
      [1.30458, 103.77537], [1.30491, 103.77496], [1.30530, 103.77488], [1.30549, 103.77513],
      [1.30564, 103.77524], [1.30594, 103.77533], [1.30635, 103.77532], [1.30660, 103.77523],
      [1.30686, 103.77499], [1.30709, 103.77464], [1.30725, 103.77412], [1.30744, 103.77400],
      [1.30794, 103.77414], [1.30835, 103.77416], [1.30864, 103.77407], [1.30893, 103.77379],
      [1.30930, 103.77281], [1.30974, 103.77222], [1.30978, 103.77204], [1.30975, 103.77186],
      [1.30965, 103.77171], [1.30950, 103.77161], [1.30693, 103.77116], [1.30597, 103.77108],
      [1.30486, 103.77125], [1.30408, 103.77153], [1.30392, 103.77170], [1.30323, 103.77284],
      [1.30320, 103.77242], [1.30301, 103.77176], [1.30293, 103.77118], [1.30343, 103.77118],
      [1.30367, 103.77112], [1.30426, 103.77060], [1.30435, 103.77029], [1.30379, 103.76900],
      [1.30379, 103.76874], [1.30313, 103.76686], [1.30273, 103.76651],
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
