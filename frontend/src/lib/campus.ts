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
 * The outline is NUS's own boundary in OpenStreetMap. The Kent Ridge campus
 * (way 54519165) and the Kent Vale staff housing (way 713272230, which has a
 * drop-off point) are widened by 15 m, with a bulge round Kent Ridge Bus
 * Terminal, whose drop-off point sits just past that. University Town (way
 * 92357946), and the campus's south edge from Clementi Road to The
 * Capricorn, are kept exactly as OpenStreetMap draws them, as a margin there
 * reaches into the houses and the school beside them. Inside corners narrower
 * than 20 m are rounded off so the joins are smooth, and the outline is cut
 * off at latitude 1.309, Order Service's own northern limit for new places
 * (it trims a strip of UTown along Dover Road), then simplified to within a
 * couple of metres. Tightened from 50 m on 2026-11-10; indoor GPS can be
 * further off than 15 m, so a reading near the edge of campus may count as
 * off campus. It replaced a rough hand trace on 2026-11-04 that also took in
 * West Coast and Science Park.
 */

import type { Coordinates } from './useGeolocation';

interface CampusArea {
  name: string;
  /** Corners as [latitude, longitude], in order around the outline. */
  outline: readonly (readonly [number, number])[];
}

/**
 * Kent Ridge only for now. The margin joins UTown and Kent Vale to the main
 * campus, so it is one outline.
 */
export const NUS_CAMPUS_AREAS: readonly CampusArea[] = [
  {
    name: 'Kent Ridge',
    outline: [
      [1.30217, 103.76671], [1.30195, 103.76674], [1.30020, 103.76776], [1.30014, 103.76785],
      [1.30015, 103.76794], [1.30052, 103.76875], [1.30062, 103.76881], [1.30079, 103.76875],
      [1.30086, 103.76876], [1.30107, 103.76920], [1.30116, 103.76927], [1.30137, 103.76932],
      [1.30142, 103.76937], [1.30132, 103.77014], [1.30124, 103.77027], [1.30005, 103.76995],
      [1.29698, 103.76975], [1.29489, 103.76966], [1.29449, 103.76987], [1.29442, 103.76982],
      [1.29441, 103.76961], [1.29431, 103.76951], [1.29418, 103.76951], [1.29402, 103.76967],
      [1.29391, 103.76963], [1.29388, 103.76946], [1.29374, 103.76915], [1.29368, 103.76919],
      [1.29359, 103.76916], [1.29275, 103.76999], [1.29271, 103.77005], [1.29259, 103.77041],
      [1.29242, 103.77053], [1.29241, 103.77278], [1.29230, 103.77342], [1.29221, 103.77348],
      [1.29186, 103.77339], [1.29148, 103.77416], [1.29105, 103.77520], [1.29079, 103.77608],
      [1.29066, 103.77669], [1.29018, 103.77770], [1.29012, 103.77806], [1.29019, 103.77839],
      [1.29046, 103.77858], [1.29051, 103.77881], [1.29049, 103.77887], [1.29043, 103.77889],
      [1.29070, 103.77922], [1.29072, 103.77931], [1.28962, 103.78016], [1.28957, 103.78028],
      [1.28964, 103.78100], [1.28987, 103.78187], [1.29024, 103.78234], [1.29143, 103.78350],
      [1.29170, 103.78359], [1.29265, 103.78467], [1.29353, 103.78549], [1.29371, 103.78558],
      [1.29394, 103.78560], [1.29402, 103.78558], [1.29505, 103.78492], [1.29646, 103.78394],
      [1.29694, 103.78348], [1.29738, 103.78298], [1.29768, 103.78254], [1.29868, 103.78073],
      [1.30040, 103.77788], [1.30204, 103.77496], [1.30243, 103.77421], [1.30257, 103.77416],
      [1.30281, 103.77412], [1.30290, 103.77416], [1.30291, 103.77424], [1.30262, 103.77481],
      [1.30340, 103.77496], [1.30346, 103.77499], [1.30373, 103.77613], [1.30419, 103.77514],
      [1.30468, 103.77456], [1.30541, 103.77440], [1.30567, 103.77461], [1.30581, 103.77482],
      [1.30610, 103.77490], [1.30635, 103.77485], [1.30655, 103.77467], [1.30667, 103.77447],
      [1.30676, 103.77425], [1.30684, 103.77386], [1.30688, 103.77382], [1.30738, 103.77353],
      [1.30796, 103.77369], [1.30837, 103.77371], [1.30853, 103.77359], [1.30859, 103.77346],
      [1.30889, 103.77261], [1.30900, 103.77246], [1.30900, 103.77197], [1.30686, 103.77161],
      [1.30603, 103.77152], [1.30500, 103.77168], [1.30431, 103.77192], [1.30315, 103.77383],
      [1.30305, 103.77385], [1.30293, 103.77368], [1.30271, 103.77365], [1.30269, 103.77357],
      [1.30284, 103.77315], [1.30292, 103.77273], [1.30288, 103.77245], [1.30270, 103.77182],
      [1.30262, 103.77123], [1.30243, 103.77095], [1.30242, 103.77087], [1.30251, 103.77082],
      [1.30277, 103.77087], [1.30348, 103.77086], [1.30400, 103.77042], [1.30404, 103.77031],
      [1.30347, 103.76905], [1.30349, 103.76884], [1.30287, 103.76703], [1.30259, 103.76679],
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
