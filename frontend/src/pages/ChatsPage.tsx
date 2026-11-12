/*
 * AI Assistance Disclosure:
 * Tool: OpenAI Codex (GPT-5), date: 2026-11-10
 * Scope: Implementation, refactoring, and test assistance for the recorded frontend work.
 */
import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { getMessage, listConversations } from '../features/chat/chat.api'
import type { ConversationListItem } from '../features/chat/chat.types'
import { useAuth } from '../features/auth/useAuth'
import { useNotifications } from '../features/notifications/useNotifications'
import { getErrand } from '../features/errands/errand.api'
import type { ErrandListItem } from '../features/errands/errand.types'

function sortByLatestMessage(conversations: ConversationListItem[]) {
  return [...conversations].sort((a, b) => {
    const aTime = Date.parse(a.lastMessage?.createdAt ?? '')
    const bTime = Date.parse(b.lastMessage?.createdAt ?? '')
    return (Number.isNaN(bTime) ? 0 : bTime) - (Number.isNaN(aTime) ? 0 : aTime)
  })
}

export function ChatsPage() {
  const { currentUserId } = useAuth()
  const notifications = useNotifications()
  const subscribeToNotifications = notifications?.subscribe
  const [items, setItems] = useState<ConversationListItem[]>([])
  const [errands, setErrands] = useState<Record<string, ErrandListItem>>({})
  const [error, setError] = useState(false)
  useEffect(() => {
    const controller = new AbortController()
    void listConversations(controller.signal).then(async (conversations) => {
      setItems(sortByLatestMessage(conversations))
      const results = await Promise.allSettled(conversations.map((conversation) => getErrand(conversation.errandId, controller.signal)))
      if (!controller.signal.aborted) setErrands(Object.fromEntries(results.flatMap((result) => result.status === 'fulfilled' ? [[result.value.id, result.value]] : [])))
    }).catch(() => { if (!controller.signal.aborted) setError(true) })
    return () => controller.abort()
  }, [])

  useEffect(() => {
    if (!subscribeToNotifications) return
    const controller = new AbortController()
    const unsubscribe = subscribeToNotifications((signal) => {
      if (signal.type !== 'notification' || signal.item.type !== 'CHAT_MESSAGE') return
      const { conversationId, messageId } = signal.item.data
      if (!conversationId || !messageId) return
      void getMessage(conversationId, messageId, controller.signal).then((message) => {
        if (controller.signal.aborted) return
        setItems((current) => {
          let changed = false
          const updated = current.map((conversation) => {
            if (conversation.id !== conversationId
                || (conversation.lastMessage?.sequenceNumber ?? -1) >= message.sequenceNumber) {
              return conversation
            }
            changed = true
            return { ...conversation, lastMessage: message }
          })
          if (!changed) return current
          return sortByLatestMessage(updated)
        })
      }).catch(() => {
        // Keep the last confirmed preview; the next page load will reconcile it.
      })
    })
    return () => {
      controller.abort()
      unsubscribe()
    }
  }, [subscribeToNotifications])

  return <section className="mx-auto max-w-3xl">
    <h1 className="text-3xl font-medium tracking-tight">Chats</h1>
    <p className="mt-2 text-sm text-[#68736c]">Messages for errands you requested or delivered.</p>
    {error ? <p role="alert" className="mt-5 rounded-xl bg-red-50 p-4 text-sm text-red-700">Could not load chats.</p> : null}
    <div className="mt-6 overflow-hidden rounded-[18px] border border-[#dde3de] bg-white">
      {items.length === 0 && !error ? <p className="p-6 text-sm text-[#68736c]">You have no chats yet.</p> : null}
      <ul className="divide-y divide-[#dde3de]">
        {items.map((conversation) => <li key={conversation.id}>
          <Link className="block px-5 py-4 hover:bg-[#f0f6f2]" to={`/chats/${conversation.id}`}>
            <div className="flex items-center justify-between gap-3">
              <span className="min-w-0">
                <span className="block truncate font-medium">{errands[conversation.errandId]?.required_item ?? 'Errand'}</span>
                <span className="block text-xs text-[#68736c]">Chat with {conversation.requesterId === currentUserId ? 'courier' : 'requester'}</span>
              </span>
              <span className="flex items-center gap-2">
                {(() => {
                  const unread = notifications?.items.filter((item) => item.type === 'CHAT_MESSAGE'
                    && item.data.conversationId === conversation.id && !item.readAt).length ?? 0
                  return unread ? <span aria-label={`${unread} unread messages`} className="min-w-5 rounded-full bg-[#175c45] px-1.5 py-0.5 text-center text-[10px] font-semibold text-white">{unread > 99 ? '99+' : unread}</span> : null
                })()}
                <span className="text-xs text-[#68736c]">{conversation.deliveryStatus}</span>
              </span>
            </div>
            <p className="mt-1 truncate text-sm text-[#53645a]">{conversation.lastMessage?.content ?? 'No messages yet'}</p>
          </Link>
        </li>)}
      </ul>
    </div>
  </section>
}
