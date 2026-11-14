/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: claude-opus-5), date: 2026-09-09
 * Scope: Generated UI mockup component ChatBubble.jsx from team-authored blueprint.md.
 *        Visual/layout implementation only. No requirements, architecture, or
 *        schema decisions were made by the AI tool.
 * Author review: Reviewed and verified by Koh Wee Jean, 2026-11-10.
 */

import { Link, useLocation } from 'react-router-dom'
import { MessageCircle } from 'lucide-react'
import { totalUnread } from '../data/messages'
import { useDemo } from '../context/DemoContext'

// Shortcut into the conversations, fixed to the bottom-right.
// Hidden when logged out - there are no conversations to reach - and hidden on the chat
// screen itself, where it would point at the page you are already on.
export default function ChatBubble() {
  const { pathname } = useLocation()
  const { isLoggedIn } = useDemo()
  if (!isLoggedIn || pathname.startsWith('/chat')) return null

  const unread = totalUnread()

  return (
    <Link
      to="/chat"
      aria-label={unread > 0 ? `Messages, ${unread} unread` : 'Messages'}
      className="fixed bottom-4 right-4 z-40 flex h-14 w-14 items-center justify-center rounded-pill bg-ink text-white shadow-modal transition-colors duration-150 hover:bg-ink-70"
    >
      <MessageCircle size={22} aria-hidden="true" />
      {unread > 0 && (
        <span className="tnum absolute -right-0.5 -top-0.5 flex h-5 min-w-[20px] items-center justify-center rounded-pill bg-orange px-1.5 text-[11px] font-semibold text-white">
          {unread}
        </span>
      )}
    </Link>
  )
}
