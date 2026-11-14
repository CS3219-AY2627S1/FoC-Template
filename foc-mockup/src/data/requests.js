/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: claude-opus-5), date: 2026-09-08
 * Scope: Generated UI mockup component requests.js from team-authored blueprint.md.
 *        Visual/layout implementation only. No requirements, architecture, or
 *        schema decisions were made by the AI tool.
 * Author review: Reviewed and verified by Koh Wee Jean, 2026-11-10.
 */

// Timestamps are generated relative to page load so the demo always reads as "just now".
//
// Three separate clocks per request (team decision):
//   postAt     - when the request is sent out to the board. null means it went out
//                immediately. A future value means it is scheduled and not yet listed.
//   expiresAt  - when an UNACCEPTED request stops being offered and the credits come back.
//                Runs from the moment it posts. Irrelevant once a courier has accepted.
//   completeBy - the deadline for the food to actually arrive. null means as soon as
//                possible, with no stated deadline. A reference for the courier, not a
//                lifecycle state.
const now = Date.now()
const minutes = (n) => new Date(now + n * 60000).toISOString()
const hoursAgo = (n) => new Date(now - n * 3600000).toISOString()
const daysAgo = (n) => new Date(now - n * 86400000).toISOString()

export const STATUSES = [
  'open',
  'accepted',
  'picked_up',
  'delivered',
  'completed',
  'cancelled',
  'expired',
]

export const STATUS_LABELS = {
  open: 'Open',
  accepted: 'Accepted',
  picked_up: 'Picked up',
  delivered: 'Delivered',
  completed: 'Completed',
  cancelled: 'Cancelled',
  expired: 'Expired',
}

export const requests = [
  {
    id: 'r1',
    supplierId: 1,
    description: '1x chicken rice, no cucumber. Chilli separate please.',
    deliveryLocation: 'COM1 Basement',
    credits: 4,
    postAt: null,
    expiresAt: minutes(42),
    completeBy: minutes(75),
    notes: 'I am at the back of the study area, near the printers.',
    status: 'open',
    requesterId: 'u3',
    courierId: null,
    createdAt: minutes(-18),
    timeline: { open: minutes(-18) },
  },
  {
    id: 'r2',
    supplierId: 13,
    description: 'Kopi-o kosong and a kaya toast set.',
    deliveryLocation: 'COM2 Level 3 Lounge',
    credits: 3,
    postAt: null,
    expiresAt: minutes(18),
    completeBy: null,
    notes: 'No sugar in the kopi, please double check with the stall.',
    status: 'open',
    requesterId: 'u4',
    courierId: null,
    createdAt: minutes(-40),
    timeline: { open: minutes(-40) },
  },
  {
    id: 'r3',
    supplierId: 10,
    description: 'Any 2 dishes cai fan, no pork. Whatever is left is fine.',
    deliveryLocation: 'Central Library',
    credits: 3,
    postAt: null,
    expiresAt: minutes(65),
    completeBy: minutes(120),
    notes: '',
    status: 'open',
    requesterId: 'u5',
    courierId: null,
    createdAt: minutes(-9),
    timeline: { open: minutes(-9) },
  },
  {
    id: 'r4',
    supplierId: 5,
    description: 'Large ban mian, extra chilli. Please do not let it get soggy.',
    deliveryLocation: 'UTown Residence',
    credits: 5,
    postAt: null,
    expiresAt: minutes(55),
    completeBy: minutes(90),
    notes: 'Leave it at the front desk if I do not pick up.',
    status: 'completed',
    requesterId: 'u1',
    courierId: null,
    createdAt: minutes(-25),
    timeline: { open: minutes(-25), completed: minutes(-5) },
  },
  {
    id: 'r5',
    supplierId: 6,
    description: 'Mixed rice, one meat two veg. Gravy on the rice is fine.',
    deliveryLocation: 'Yusof Ishak House',
    credits: 4,
    postAt: null,
    expiresAt: minutes(30),
    completeBy: minutes(60),
    notes: '',
    status: 'accepted',
    requesterId: 'u5',
    courierId: 'u2',
    createdAt: minutes(-52),
    timeline: { open: minutes(-52), accepted: minutes(-11) },
  },
  {
    id: 'r6',
    supplierId: 1,
    description: '1x chicken rice, no cucumber. Chilli separate please.',
    deliveryLocation: 'COM1 Basement',
    credits: 4,
    postAt: null,
    expiresAt: minutes(35),
    completeBy: minutes(50),
    notes: 'I am in a lecture until 3, meet at the side entrance.',
    status: 'accepted',
    requesterId: 'u1',
    courierId: 'u3',
    createdAt: minutes(-26),
    timeline: { open: minutes(-26), accepted: minutes(-19) },
  },
  {
    id: 'r7',
    supplierId: 12,
    description: 'Two prata kosong and one teh peng.',
    deliveryLocation: 'PGP Residence Block A',
    credits: 4,
    postAt: null,
    expiresAt: minutes(20),
    completeBy: minutes(35),
    notes: 'Block A lobby, I will wait downstairs.',
    status: 'completed',
    requesterId: 'u1',
    courierId: 'u5',
    createdAt: minutes(-48),
    timeline: { open: minutes(-48), accepted: minutes(-41), picked_up: minutes(-29), completed: minutes(-12) },
  },
  {
    id: 'r8',
    supplierId: 3,
    description: 'Yong tau foo, dry, six pieces. Chilli and sweet sauce.',
    deliveryLocation: 'COM1 Basement',
    credits: 4,
    postAt: null,
    expiresAt: minutes(-5),
    completeBy: hoursAgo(2.3),
    notes: '',
    status: 'completed',
    requesterId: 'u1',
    courierId: 'u3',
    createdAt: hoursAgo(3),
    timeline: {
      open: hoursAgo(3),
      accepted: hoursAgo(2.8),
      picked_up: hoursAgo(2.6),
      delivered: hoursAgo(2.4), completed: hoursAgo(2.2) },
  },
  {
    id: 'r9',
    supplierId: 10,
    description: 'Sliced fish soup, thick bee hoon, no milk.',
    deliveryLocation: 'i3 Building',
    credits: 5,
    postAt: null,
    expiresAt: daysAgo(1),
    completeBy: daysAgo(1),
    notes: '',
    status: 'completed',
    requesterId: 'u2',
    courierId: 'u1',
    createdAt: daysAgo(1),
    timeline: {
      open: daysAgo(1.05),
      accepted: daysAgo(1.04),
      picked_up: daysAgo(1.02),
      delivered: daysAgo(1.01),
      completed: daysAgo(1),
    },
  },
  {
    id: 'r10',
    supplierId: 11,
    description: 'Nasi lemak set with extra sambal, and a bandung.',
    deliveryLocation: 'SDE4 Studio',
    credits: 6,
    postAt: null,
    expiresAt: daysAgo(2),
    completeBy: daysAgo(2),
    notes: '',
    status: 'cancelled',
    requesterId: 'u1',
    courierId: null,
    createdAt: daysAgo(2),
    timeline: { open: daysAgo(2.1), cancelled: daysAgo(2) },
  },
  {
    id: 'r11',
    supplierId: 6,
    description: 'Any bubble tea, half sugar, less ice.',
    deliveryLocation: 'UTown Residence',
    credits: 3,
    postAt: null,
    expiresAt: daysAgo(3),
    completeBy: null,
    notes: '',
    status: 'expired',
    requesterId: 'u1',
    courierId: null,
    createdAt: daysAgo(3),
    timeline: { open: daysAgo(3.2), expired: daysAgo(3) },
  },
  {
    id: 'r12',
    supplierId: 8,
    description: 'Iced milo and a tuna sandwich, if they still have it.',
    deliveryLocation: 'LT19',
    credits: 3,
    postAt: null,
    expiresAt: minutes(25),
    completeBy: minutes(40),
    notes: 'Back row of LT19, I will come down to the door.',
    status: 'picked_up',
    requesterId: 'u4',
    courierId: 'u1',
    createdAt: minutes(-33),
    timeline: { open: minutes(-33), accepted: minutes(-24), picked_up: minutes(-6) },
  },
]

export const getRequest = (id) => requests.find((r) => r.id === id)

// Small display helpers, kept beside the data so no extra module is introduced.
export const minutesUntil = (iso) => Math.round((new Date(iso).getTime() - Date.now()) / 60000)

export const expiryLabel = (iso) => {
  const m = minutesUntil(iso)
  if (m <= 0) return 'expired'
  if (m < 60) return 'expires in ' + m + ' min'
  const h = Math.floor(m / 60)
  return 'expires in ' + h + ' hr ' + (m % 60) + ' min'
}

export const clockTime = (iso) =>
  new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })

export const fullTime = (iso) =>
  new Date(iso).toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })

// "Deliver by 15:30", or the ASAP wording when no deadline was set.
export const completeByLabel = (iso) => (iso ? 'deliver by ' + clockTime(iso) : 'deliver ASAP')

export const completeByShort = (iso) => (iso ? clockTime(iso) : 'ASAP')

// "Goes out at 14:30", or the immediate wording when it was not scheduled.
export const postAtLabel = (iso) => (iso ? 'goes out at ' + clockTime(iso) : 'posted immediately')

export const LIFECYCLE = ['open', 'accepted', 'picked_up', 'delivered', 'completed']

export const LIFECYCLE_LABELS = {
  open: 'Posted',
  accepted: 'Accepted',
  picked_up: 'Picked up',
  delivered: 'Delivered',
  completed: 'Completed',
}
