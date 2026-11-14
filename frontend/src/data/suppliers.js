/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: claude-opus-5), date: 2026-09-08
 * Scope: Generated UI mockup component suppliers.js from team-authored blueprint.md.
 *        Visual/layout implementation only. No requirements, architecture, or
 *        schema decisions were made by the AI tool.
 * Author review: <pending — team member to sign>
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
 * Author review: Congchen
 * Tool: Claude Code (model: claude-sonnet-5-5), date: 2026-11-11
 * Scope: removed the mock supplier seed data and the helpers derived from it (getSupplier, matchesQuery, suppliersAtLocation, reference lists); the pure display helpers stay (the demo is gone, all services are live).
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review:
 */

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

export const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
