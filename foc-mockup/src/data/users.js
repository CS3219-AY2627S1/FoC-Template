/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: claude-opus-5), date: 2026-09-08
 * Scope: Generated UI mockup component users.js from team-authored blueprint.md.
 *        Visual/layout implementation only. No requirements, architecture, or
 *        schema decisions were made by the AI tool.
 * Author review: Reviewed and verified by Koh Wee Jean, 2026-11-10.
 */

export const currentUser = {
  id: 'u1',
  name: 'Koh Wee Jean',
  given: 'Wee Jean',
  initials: 'WJ',
  email: 'weejean@u.nus.edu',
  creditsAvailable: 14,
  creditsReserved: 6,
  errandsCompleted: 9,
  rating: 4.8,
}

export const users = [
  currentUser,
  {
    id: 'u2',
    name: 'Gabriel Yap',
    given: 'Gabriel',
    initials: 'GY',
    email: 'gabriel@u.nus.edu',
    creditsAvailable: 21,
    creditsReserved: 0,
    errandsCompleted: 12,
    rating: 4.7,
  },
  {
    id: 'u3',
    name: 'Tng Wen Xi',
    given: 'Wen Xi',
    initials: 'WX',
    email: 'wenxi@u.nus.edu',
    creditsAvailable: 8,
    creditsReserved: 4,
    errandsCompleted: 23,
    rating: 4.9,
  },
  {
    id: 'u4',
    name: 'Xiao Congchen',
    given: 'Congchen',
    initials: 'XC',
    email: 'congchen@u.nus.edu',
    creditsAvailable: 17,
    creditsReserved: 3,
    errandsCompleted: 6,
    rating: 4.6,
  },
  {
    id: 'u5',
    name: 'Yeo Bing Teck',
    given: 'Bing Teck',
    initials: 'BT',
    email: 'bingteck@u.nus.edu',
    creditsAvailable: 11,
    creditsReserved: 5,
    errandsCompleted: 15,
    rating: 4.8,
  },
]

export const getUser = (id) => users.find((u) => u.id === id)

// Given name, stated per user: surname position differs across the team's names.
export const firstName = (user) => (user ? user.given : '')
