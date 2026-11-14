/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: claude-opus-5), date: 2026-09-08
 * Scope: Generated UI mockup component messages.js from team-authored blueprint.md.
 *        Visual/layout implementation only. No requirements, architecture, or
 *        schema decisions were made by the AI tool.
 * Author review: Reviewed and verified by Koh Wee Jean, 2026-11-10.
 */

// Translations are pre-written by hand. There is no translation API in this mockup.
// The system speaks as FoC itself. It has no user record and no errand attached, so the chat
// screen falls back to an account-updates layout for it.
export const SYSTEM_USER = {
  id: 'system',
  name: 'FoC',
  given: 'FoC',
  initials: 'FoC',
}

export const threads = [
  {
    id: 'system',
    requestId: null,
    withUserId: 'system',
    lastAt: '10:00',
    unread: 1,
    messages: [
      {
        id: 'm0',
        from: 'system',
        text: "Welcome to FoC. You've been awarded 20 credits to get you started. Post an errand to spend them, or run one for someone else to earn more.",
        translation: null,
        lang: 'en',
        at: '10:00',
      },
    ],
  },
  {
    id: 't1',
    requestId: 'r6',
    withUserId: 'u3',
    lastAt: '14:24',
    unread: 2,
    messages: [
      {
        id: 'm1',
        from: 'u3',
        text: "Hi Wee Jean, I've accepted your errand. Heading to The Deck now.",
        translation: null,
        lang: 'en',
        at: '14:09',
      },
      {
        id: 'm2',
        from: 'u1',
        text: 'Thanks! No rush, I finish class at 3.',
        translation: null,
        lang: 'en',
        at: '14:10',
      },
      {
        id: 'm3',
        from: 'u3',
        text: '排队有点长，可能要多等十分钟。',
        translation: 'The queue is quite long, it might take ten more minutes.',
        lang: 'zh',
        at: '14:18',
      },
      {
        id: 'm4',
        from: 'u3',
        text: '我到了，你要加辣吗？',
        translation: "I'm here — do you want extra chilli?",
        lang: 'zh',
        at: '14:21',
      },
      {
        id: 'm5',
        from: 'u1',
        text: 'Yes please, chilli separate if they can.',
        translation: null,
        lang: 'en',
        at: '14:22',
      },
      {
        id: 'm6',
        from: 'u3',
        text: 'Okay. Side entrance of COM1 in about 10 minutes.',
        translation: null,
        lang: 'en',
        at: '14:24',
      },
    ],
  },
  {
    id: 't2',
    requestId: 'r7',
    withUserId: 'u5',
    lastAt: '13:40',
    unread: 0,
    messages: [
      {
        id: 'm7',
        from: 'u5',
        text: 'Picked up. Walking over to PGP now.',
        translation: null,
        lang: 'en',
        at: '13:38',
      },
      {
        id: 'm8',
        from: 'u1',
        text: "I'm in the Block A lobby.",
        translation: null,
        lang: 'en',
        at: '13:40',
      },
    ],
  },
  {
    id: 't3',
    requestId: 'r12',
    withUserId: 'u4',
    lastAt: '13:02',
    unread: 0,
    messages: [
      {
        id: 'm9',
        from: 'u4',
        text: 'Saya di baris belakang LT19, terima kasih!',
        translation: "I'm in the back row of LT19, thank you!",
        lang: 'ms',
        at: '13:01',
      },
      {
        id: 'm10',
        from: 'u1',
        text: 'Got it. Kiosk queue is short, be there soon.',
        translation: null,
        lang: 'en',
        at: '13:02',
      },
    ],
  },
]

export const LANG_NAMES = { zh: 'Chinese', ms: 'Malay', en: 'English' }

export const getThreadByRequest = (requestId) => threads.find((t) => t.requestId === requestId)

// A thread is addressed by its errand id where it has one, and by its own id otherwise.
export const threadHref = (thread) => '/chat/' + (thread.requestId || thread.id)

export const findThread = (id) => threads.find((t) => t.requestId === id || t.id === id)

export const totalUnread = () => threads.reduce((sum, t) => sum + t.unread, 0)
