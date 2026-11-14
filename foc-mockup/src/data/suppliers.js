/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: claude-opus-5), date: 2026-09-08
 * Scope: Generated UI mockup component suppliers.js from team-authored blueprint.md.
 *        Visual/layout implementation only. No requirements, architecture, or
 *        schema decisions were made by the AI tool.
 * Author review: Reviewed and verified by Koh Wee Jean, 2026-11-10.
 *
 * Tool: Claude Code (model: claude-sonnet-5-5), date: 2026-09-30
 * Scope: Reshaped the mock data and helpers to the Supplier Service response contract
 *        (SupplierServiceArchitecture.md §7.3) following the team's field-by-field resolution
 *        given in chat. No requirements, architecture, schema, or API decisions were made by
 *        the AI tool.
 * Author review: Congchen
  *
 * Tool: Claude Code (model: claude-sonnet-5-5), date: 2026-09-30
 * Scope: Supplier objects now carry location_id, faculty_id and categories as {category, category_id} objects. Per the team's decision in chat;
 *        no other requirements, architecture, schema, or API decisions were made by the
 *        AI tool.
 * Author review: Reviewed and verified by Koh Wee Jean, 2026-11-10.
 */

// TEAM DECISION (2026-09-30): supplier objects use exactly the fields the Supplier Service API
// returns (§7.3). Mockup field -> API field, as resolved by the team:
//   id (string)      -> id (number)
//   venue            -> location
//   location         -> faculty
//   shortName        -> removed
//   category         -> categories[] of { category, category_id } (shown as pills)
//   description      -> desc (detail view only; the list does not show it)
//   image            -> photos[].photoLocation (the API returns signed URLs)
//   activeRequests   -> deferred (Order Service data, not supplier-service)
//
// PLACEHOLDER MOCK VALUES, not team data: `type` ('Store' everywhere), `level` (1 everywhere),
// every supplier's opening hours (the same each day, Mon-Sun), and `photoLocation`, which points
// at local files under /images/ until real signed URLs exist. Suppliers that had no venue use
// their old location text as `location` because the API requires one.

// `hours` is expanded to one openingHours entry per day (1 = Monday .. 7 = Sunday, §6.2) because
// the detail response carries per-day hours. The list response does not, so list views never
// read it.
const supplier = ({ hours, photo, ...rest }) => ({
  ...rest,
  photos: [{ photoId: rest.id * 100 + 1, photoLocation: photo, displayOrder: 0 }],
  openingHours: [1, 2, 3, 4, 5, 6, 7].map((day) => ({ day, open: hours[0], close: hours[1] })),
})

const rawSuppliers = [
  supplier({
    id: 1,
    name: "Roasted Delights",
    type: 'Store',
    location: "The Deck",
    faculty: "Faculty of Arts & Social Sciences",
    level: 1,
    categories: ["Canteen"],
    hours: ['07:30', '20:00'],
    isOpen: true,
    photo: "/images/stalls/roasted%20delight.webp",
    desc: "Roast meats, chicken rice, char siew.",
  }),
  supplier({
    id: 2,
    name: "Japanese",
    type: 'Store',
    location: "The Deck",
    faculty: "Faculty of Arts & Social Sciences",
    level: 1,
    categories: ["Canteen"],
    hours: ['11:00', '19:30'],
    isOpen: true,
    photo: "/images/stalls/japanese.jpg",
    desc: "Donburi, katsu sets, cold soba.",
  }),
  supplier({
    id: 3,
    name: "Yong Tau Foo & Laksa",
    type: 'Store',
    location: "The Deck",
    faculty: "Faculty of Arts & Social Sciences",
    level: 1,
    categories: ["Canteen"],
    hours: ['07:30', '19:00'],
    isOpen: true,
    photo: "/images/stalls/yongtaufooandlaksa.jpg",
    desc: "Pick your own pieces, soup or dry, laksa gravy.",
  }),
  supplier({
    id: 4,
    name: "Vegetarian",
    type: 'Store',
    location: "The Deck",
    faculty: "Faculty of Arts & Social Sciences",
    level: 1,
    categories: ["Canteen"],
    hours: ['10:30', '19:00'],
    isOpen: false,
    photo: "/images/stalls/vegetarian.jpg",
    desc: "Mixed rice, all vegetarian, no onion or garlic on request.",
  }),
  supplier({
    id: 5,
    name: "Fine Food",
    type: 'Store',
    location: "UTown",
    faculty: "UTown",
    level: 1,
    categories: ["Food court"],
    hours: ['07:30', '21:30'],
    isOpen: true,
    photo: "/images/suppliers/utownfinefood.jpg",
    desc: "Food court in Stephen Riady Centre, one level up from the plaza.",
  }),
  supplier({
    id: 6,
    name: "Flavours",
    type: 'Store',
    location: "UTown",
    faculty: "UTown",
    level: 1,
    categories: ["Food court"],
    hours: ['07:00', '21:00'],
    isOpen: true,
    photo: "/images/suppliers/flavours.jpg",
    desc: "The larger UTown food court, beside the Education Resource Centre.",
  }),
  supplier({
    id: 7,
    name: "食堂",
    type: 'Store',
    location: "UTown Plaza",
    faculty: "UTown",
    level: 1,
    categories: ["Food court"],
    hours: ['10:30', '21:00'],
    isOpen: false,
    photo: "/images/suppliers/utownplaza.png",
    desc: "Chinese food court at the UTown plaza level.",
  }),
  supplier({
    id: 8,
    name: "Tomoro Coffee",
    type: 'Store',
    location: "Hong Swee Sen Memorial Library",
    faculty: "Hong Swee Sen Memorial Library",
    level: 1,
    categories: ["Café"],
    hours: ['08:30', '20:00'],
    isOpen: true,
    photo: "/images/stalls/tomorocoffee.jpg",
    desc: "Coffee, tea and pastries on the library level.",
  }),
  supplier({
    id: 9,
    name: "Techno Edge",
    type: 'Store',
    location: "Faculty of Engineering",
    faculty: "Faculty of Engineering",
    level: 1,
    categories: ["Canteen"],
    hours: ['07:00', '21:00'],
    isOpen: false,
    photo: "/images/suppliers/techno-edge.jpg",
    desc: "Engineering canteen next to E2. Known for the late-night supper stalls.",
  }),
  supplier({
    id: 10,
    name: "Frontier",
    type: 'Store',
    location: "Faculty of Science",
    faculty: "Faculty of Science",
    level: 1,
    categories: ["Canteen"],
    hours: ['07:30', '20:30'],
    isOpen: true,
    photo: "/images/suppliers/frontier.png",
    desc: "Science canteen at S16. Wide stall mix, gets very full at noon.",
  }),
  supplier({
    id: 11,
    name: "The Terrace",
    type: 'Store',
    location: "School of Design & Environment",
    faculty: "School of Design & Environment",
    level: 1,
    categories: ["Canteen"],
    hours: ['07:30', '19:00'],
    isOpen: true,
    photo: "/images/suppliers/terrace.png",
    desc: "Open-air canteen at SDE. Quiet outside lunch hours.",
  }),
  supplier({
    id: 12,
    name: "PGPR Canteen",
    type: 'Store',
    location: "Prince George's Park Residences",
    faculty: "Prince George's Park Residences",
    level: 1,
    categories: ["Canteen"],
    hours: ['07:00', '22:00'],
    isOpen: true,
    photo: "/images/suppliers/PGP-canteen.jpg",
    desc: "Residence canteen serving PGPR. Breakfast and late supper.",
  }),
  supplier({
    id: 13,
    name: "Cool Spot",
    type: 'Store',
    location: "University Sports Centre",
    faculty: "University Sports Centre",
    level: 1,
    categories: ["Café"],
    hours: ['08:00', '20:00'],
    isOpen: true,
    photo: "/images/stalls/cool-spot.jpg",
    desc: "Drinks and snacks kiosk by the sports centre.",
  }),
  supplier({
    id: 14,
    name: "Spinelli Coffee",
    type: 'Store',
    location: "Faculty of Law",
    faculty: "Faculty of Law",
    level: 1,
    categories: ["Café"],
    hours: ['08:00', '18:00'],
    isOpen: false,
    photo: "/images/stalls/spinelli.jpg",
    desc: "Coffee bar on the law campus.",
  }),
]

// --- Reference data ---------------------------------------------------------------------
// Mirrors GET /api/v1/suppliers/reference/location and /reference/categories (§7.3). Derived from
// the supplier list so the filters never offer an option with no supplier behind it.
const unique = (list) => [...new Set(list)]

const facultyNames = unique(rawSuppliers.map((s) => s.faculty))
export const faculties = facultyNames.map((faculty, i) => ({ faculty_id: i + 1, faculty }))

export const locationRefs = unique(rawSuppliers.map((s) => s.location + '|' + s.faculty)).map(
  (key, i) => {
    const [location, faculty] = key.split('|')
    return {
      location_id: i + 1,
      location,
      faculty_id: faculties.find((f) => f.faculty === faculty).faculty_id,
      faculty,
    }
  },
)

export const categoryRefs = unique(rawSuppliers.flatMap((s) => s.categories)).map(
  (category, i) => ({ category_id: i + 1, category }),
)

// Team decision (2026-09-30): every supplier response carries the ids beside the names, and
// `categories` is a list of { category, category_id } objects.
export const suppliers = rawSuppliers.map((s) => {
  const loc = locationRefs.find((l) => l.location === s.location && l.faculty === s.faculty)
  return {
    ...s,
    location_id: loc.location_id,
    faculty_id: loc.faculty_id,
    categories: s.categories.map((name) => {
      const ref = categoryRefs.find((r) => r.category === name)
      return { category: ref.category, category_id: ref.category_id }
    }),
  }
})

export const getSupplier = (id) => suppliers.find((s) => s.id === Number(id))

// "Roasted Delights @ The Deck" — used wherever a supplier appears outside its location group.
export const qualifiedName = (supplier) =>
  !supplier
    ? ''
    : supplier.location && supplier.location !== supplier.name
      ? supplier.name + ' @ ' + supplier.location
      : supplier.name

// Photos are ordered by displayOrder (§8.2); the first is the cover.
export const coverPhoto = (supplier) =>
  supplier?.photos?.length
    ? [...supplier.photos].sort((a, b) => a.displayOrder - b.displayOrder)[0]
    : null

// Mirrors the §7.2 `search` parameter: name, location or category, case-insensitive.
export const matchesQuery = (supplier, query) => {
  const q = query.trim().toLowerCase()
  if (!q) return true
  return [supplier.name, supplier.location, ...supplier.categories.map((c) => c.category)]
    .join(' ')
    .toLowerCase()
    .includes(q)
}

// A view over the flat list: locations in first-seen order. Not a parent-child relationship.
export const groupByLocation = (list) => {
  const groups = []
  const byLocation = new Map()
  list.forEach((s) => {
    if (!byLocation.has(s.location)) {
      const group = { location: s.location, items: [] }
      byLocation.set(s.location, group)
      groups.push(group)
    }
    byLocation.get(s.location).items.push(s)
  })
  return groups
}

// Open state is per supplier; a location group only summarises.
export const locationOpenSummary = (items) => {
  const open = items.filter((s) => s.isOpen).length
  if (items.length === 1) return open === 1 ? 'Open now' : 'Closed'
  return open + ' of ' + items.length + ' open now'
}

// Other suppliers sharing a location — used on the supplier detail screen.
export const suppliersAtLocation = (supplier) =>
  suppliers.filter((s) => s.location === supplier.location && s.id !== supplier.id)

export const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
