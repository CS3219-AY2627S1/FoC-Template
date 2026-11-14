/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: claude-opus-5), date: 2026-09-08
 * Scope: Generated UI mockup component transactions.js from team-authored blueprint.md.
 *        Visual/layout implementation only. No requirements, architecture, or
 *        schema decisions were made by the AI tool.
 * Author review: Reviewed and verified by Koh Wee Jean, 2026-11-10.
 */

// Wallet history (Credit F1.5.2). Each row expands to the logged detail from F2.1.1.
export const transactions = [
  {
    id: 'tx1',
    type: 'earned',
    title: 'Errand completed · Frontier',
    counterparty: 'From Gabriel',
    date: 'Yesterday',
    timestamp: '7 Sep 2026, 18:42',
    delta: 5,
    requestId: 'r9',
    userLabel: 'Gabriel Yap (u2)',
  },
  {
    id: 'tx2',
    type: 'reserved',
    title: 'Reserved for errand · Roasted Delights',
    counterparty: 'Held until the errand completes or is cancelled',
    date: 'Yesterday',
    timestamp: '7 Sep 2026, 14:02',
    delta: -4,
    requestId: 'r6',
    userLabel: 'Koh Wee Jean (u1)',
  },
  {
    id: 'tx3',
    type: 'spent',
    title: 'Errand completed · Techno Edge',
    counterparty: 'To Wen Xi',
    date: '3 Sep',
    timestamp: '3 Sep 2026, 12:15',
    delta: -4,
    requestId: 'r87',
    userLabel: 'Tng Wen Xi (u3)',
  },
  {
    id: 'tx4',
    type: 'returned',
    title: 'Errand expired, credits returned',
    counterparty: 'Flavours @ UTown',
    date: '2 Sep',
    timestamp: '2 Sep 2026, 21:00',
    delta: 3,
    requestId: 'r11',
    userLabel: 'Koh Wee Jean (u1)',
  },
  {
    id: 'tx5',
    type: 'returned',
    title: 'Errand cancelled, credits returned',
    counterparty: 'The Terrace',
    date: '1 Sep',
    timestamp: '1 Sep 2026, 09:26',
    delta: 6,
    requestId: 'r10',
    userLabel: 'Koh Wee Jean (u1)',
  },
  {
    id: 'tx6',
    type: 'bonus',
    title: 'Welcome bonus',
    counterparty: 'Starting balance',
    date: '28 Aug',
    timestamp: '28 Aug 2026, 10:00',
    delta: 20,
    requestId: null,
    userLabel: 'Koh Wee Jean (u1)',
  },
]

export const TX_FILTERS = ['All', 'Earned', 'Spent', 'Reserved', 'Returned']
