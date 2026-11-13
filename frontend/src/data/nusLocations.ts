export type NusLocation = {
  id: string
  name: string
  detail: string
  latitude: number
  longitude: number
}

export const nusLocations: NusLocation[] = [
  {
    id: 'com2',
    name: 'COM2',
    detail: 'School of Computing. Food and convenience stops nearby.',
    latitude: 1.2939,
    longitude: 103.7741,
  },
  {
    id: 'pc-commons',
    name: 'PC Commons',
    detail: 'Computing commons and printing services at COM1.',
    latitude: 1.2949,
    longitude: 103.7738,
  },
  {
    id: 'com1',
    name: 'COM1',
    detail: 'School of Computing. Campus services desk and printers.',
    latitude: 1.2949,
    longitude: 103.7742,
  },
  {
    id: 'com3',
    name: 'COM3',
    detail: 'Computing building with a print hub.',
    latitude: 1.2946,
    longitude: 103.7754,
  },
  {
    id: 'pgp',
    name: 'PGP',
    detail: "Prince George's Park residences.",
    latitude: 1.2914,
    longitude: 103.7806,
  },
  {
    id: 'utown',
    name: 'UTown',
    detail: 'University Town. Food and convenience services.',
    latitude: 1.3047,
    longitude: 103.7731,
  },
  {
    id: 'central-library',
    name: 'Central Library',
    detail: 'Kent Ridge library and printing.',
    latitude: 1.2966,
    longitude: 103.7726,
  },
  {
    id: 'university-hall',
    name: 'University Hall',
    detail: 'Campus administration along Kent Ridge Drive.',
    latitude: 1.2973,
    longitude: 103.7781,
  },
  {
    id: 'engineering',
    name: 'Engineering',
    detail: 'Faculty of Engineering. Food outlets and plotter room.',
    latitude: 1.2988,
    longitude: 103.7712,
  },
]

export const kentRidgeCentre = {
  latitude: 1.2966,
  longitude: 103.7764,
}
