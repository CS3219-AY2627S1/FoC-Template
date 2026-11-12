/*
 * AI Assistance Disclosure:
 * Tool: OpenAI Codex (GPT-5), date: 2026-11-09
 * Scope: Implementation and test assistance for chat notification banners.
 */
import { useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router'
import { loadChatPreview } from '../chat/chat.preview'
import type { ChatNotificationItem } from './notification.types'
import { useNotifications } from './useNotifications'

type Banner = { notification: ChatNotificationItem; preview: string }

export function ChatNotificationBanners() {
  const notifications = useNotifications()
  const location = useLocation()
  const [banners, setBanners] = useState<Banner[]>([])

  useEffect(() => notifications?.subscribe((signal) => {
    if (signal.type !== 'notification' || signal.item.type !== 'CHAT_MESSAGE') return
    const item = signal.item as ChatNotificationItem
    if (location.pathname === `/chats/${item.data.conversationId}`) return
    void loadChatPreview(item.data.conversationId, item.data.messageId)
      .catch(() => item.message)
      .then((preview) => {
        setBanners((current) => [...current.filter((entry) => entry.notification.id !== item.id), { notification: item, preview }].slice(-3))
        window.setTimeout(() => setBanners((current) => current.filter((entry) => entry.notification.id !== item.id)), 5000)
      })
  }), [location.pathname, notifications])

  if (!banners.length) return null
  return <aside aria-label="New chat messages" className="fixed inset-x-4 top-20 z-[60] ml-auto flex max-w-md flex-col gap-2 lg:right-6 lg:left-auto">
    {banners.map(({ notification, preview }) => <div key={notification.id} className="rounded-xl border border-[#bdd5c8] bg-white p-4 shadow-lg">
      <div className="flex items-start justify-between gap-3">
        <Link to={`/chats/${notification.data.conversationId}`} onClick={() => { setBanners((current) => current.filter((entry) => entry.notification.id !== notification.id)); void notifications?.markRead([notification.id]) }} className="min-w-0 flex-1">
          <span className="block text-xs font-semibold uppercase tracking-wide text-[#175c45]">New message</span>
          <span className="mt-1 block truncate text-sm text-[#17211d]">{preview}</span>
        </Link>
        <button type="button" aria-label="Dismiss notification" onClick={() => setBanners((current) => current.filter((entry) => entry.notification.id !== notification.id))} className="text-[#68736c]">×</button>
      </div>
    </div>)}
  </aside>
}
