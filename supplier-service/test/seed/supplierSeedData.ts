/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: claude-sonnet-5-5), date: 2026-09-30
 * Scope: Dev seed data for the local database: the 14 suppliers the frontend mock showed, copied from
 *        the mock's supplier list (location = its old venue, faculty = its old location, the category
 *        names as-is). `type`, opening hours (the same every day) and the location `level` are the
 *        mock's placeholders, not team data. No requirements, architecture, schema, or API decisions
 *        were made by the AI tool.
 * Author review: Congchen
 */

export interface SeedSupplier {
  name: string;
  type: 'Store';
  desc: string;
  location: string;
  faculty: string;
  categories: string[];
  hours: { open: string; close: string };
  /** Path under the frontend's public/images folder. */
  photo: string;
}

// Placeholder used for every seeded location (the mock had no level).
export const SEED_LOCATION_LEVEL = 1;

export const seedSuppliers: SeedSupplier[] = [
  {
    name: 'Roasted Delights',
    type: 'Store',
    desc: 'Roast meats, chicken rice, char siew.',
    location: 'The Deck',
    faculty: 'Faculty of Arts & Social Sciences',
    categories: ['Canteen'],
    hours: { open: '07:30', close: '20:00' },
    photo: 'stalls/roasted delight.webp',
  },
  {
    name: 'Japanese',
    type: 'Store',
    desc: 'Donburi, katsu sets, cold soba.',
    location: 'The Deck',
    faculty: 'Faculty of Arts & Social Sciences',
    categories: ['Canteen'],
    hours: { open: '11:00', close: '19:30' },
    photo: 'stalls/japanese.jpg',
  },
  {
    name: 'Yong Tau Foo & Laksa',
    type: 'Store',
    desc: 'Pick your own pieces, soup or dry, laksa gravy.',
    location: 'The Deck',
    faculty: 'Faculty of Arts & Social Sciences',
    categories: ['Canteen'],
    hours: { open: '07:30', close: '19:00' },
    photo: 'stalls/yongtaufooandlaksa.jpg',
  },
  {
    name: 'Vegetarian',
    type: 'Store',
    desc: 'Mixed rice, all vegetarian, no onion or garlic on request.',
    location: 'The Deck',
    faculty: 'Faculty of Arts & Social Sciences',
    categories: ['Canteen'],
    hours: { open: '10:30', close: '19:00' },
    photo: 'stalls/vegetarian.jpg',
  },
  {
    name: 'Fine Food',
    type: 'Store',
    desc: 'Food court in Stephen Riady Centre, one level up from the plaza.',
    location: 'UTown',
    faculty: 'UTown',
    categories: ['Food court'],
    hours: { open: '07:30', close: '21:30' },
    photo: 'suppliers/utownfinefood.jpg',
  },
  {
    name: 'Flavours',
    type: 'Store',
    desc: 'The larger UTown food court, beside the Education Resource Centre.',
    location: 'UTown',
    faculty: 'UTown',
    categories: ['Food court'],
    hours: { open: '07:00', close: '21:00' },
    photo: 'suppliers/flavours.jpg',
  },
  {
    name: '食堂',
    type: 'Store',
    desc: 'Chinese food court at the UTown plaza level.',
    location: 'UTown Plaza',
    faculty: 'UTown',
    categories: ['Food court'],
    hours: { open: '10:30', close: '21:00' },
    photo: 'suppliers/utownplaza.png',
  },
  {
    name: 'Tomoro Coffee',
    type: 'Store',
    desc: 'Coffee, tea and pastries on the library level.',
    location: 'Hong Swee Sen Memorial Library',
    faculty: 'Hong Swee Sen Memorial Library',
    categories: ['Café'],
    hours: { open: '08:30', close: '20:00' },
    photo: 'stalls/tomorocoffee.jpg',
  },
  {
    name: 'Techno Edge',
    type: 'Store',
    desc: 'Engineering canteen next to E2. Known for the late-night supper stalls.',
    location: 'Faculty of Engineering',
    faculty: 'Faculty of Engineering',
    categories: ['Canteen'],
    hours: { open: '07:00', close: '21:00' },
    photo: 'suppliers/techno-edge.jpg',
  },
  {
    name: 'Frontier',
    type: 'Store',
    desc: 'Science canteen at S16. Wide stall mix, gets very full at noon.',
    location: 'Faculty of Science',
    faculty: 'Faculty of Science',
    categories: ['Canteen'],
    hours: { open: '07:30', close: '20:30' },
    photo: 'suppliers/frontier.png',
  },
  {
    name: 'The Terrace',
    type: 'Store',
    desc: 'Open-air canteen at SDE. Quiet outside lunch hours.',
    location: 'School of Design & Environment',
    faculty: 'School of Design & Environment',
    categories: ['Canteen'],
    hours: { open: '07:30', close: '19:00' },
    photo: 'suppliers/terrace.png',
  },
  {
    name: 'PGPR Canteen',
    type: 'Store',
    desc: 'Residence canteen serving PGPR. Breakfast and late supper.',
    location: "Prince George's Park Residences",
    faculty: "Prince George's Park Residences",
    categories: ['Canteen'],
    hours: { open: '07:00', close: '22:00' },
    photo: 'suppliers/PGP-canteen.jpg',
  },
  {
    name: 'Cool Spot',
    type: 'Store',
    desc: 'Drinks and snacks kiosk by the sports centre.',
    location: 'University Sports Centre',
    faculty: 'University Sports Centre',
    categories: ['Café'],
    hours: { open: '08:00', close: '20:00' },
    photo: 'stalls/cool-spot.jpg',
  },
  {
    name: 'Spinelli Coffee',
    type: 'Store',
    desc: 'Coffee bar on the law campus.',
    location: 'Faculty of Law',
    faculty: 'Faculty of Law',
    categories: ['Café'],
    hours: { open: '08:00', close: '18:00' },
    photo: 'stalls/spinelli.jpg',
  },
];
