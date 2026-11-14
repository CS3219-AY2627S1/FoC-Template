/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: claude-opus-5), date: 2026-09-08
 * Scope: Generated UI mockup component locations.js from team-authored blueprint.md.
 *        Visual/layout implementation only. No requirements, architecture, or
 *        schema decisions were made by the AI tool.
 * Author review: Reviewed and verified by Koh Wee Jean, 2026-11-10.
 */

export const locations = [
  { id: 'l1', name: 'COM1 Basement', bookmarked: true },
  { id: 'l2', name: 'COM2 Level 3 Lounge', bookmarked: true },
  { id: 'l3', name: 'LT19', bookmarked: false },
  { id: 'l4', name: 'Central Library', bookmarked: false },
  { id: 'l5', name: 'i3 Building', bookmarked: false },
  { id: 'l6', name: 'SDE4 Studio', bookmarked: false },
  { id: 'l7', name: 'PGP Residence Block A', bookmarked: false },
  { id: 'l8', name: 'UTown Residence', bookmarked: false },
  { id: 'l9', name: 'Yusof Ishak House', bookmarked: false },
  { id: 'l10', name: 'Kent Ridge MRT', bookmarked: false },
]

export const bookmarkedLocations = locations.filter((l) => l.bookmarked)
export const otherLocations = locations.filter((l) => !l.bookmarked)
