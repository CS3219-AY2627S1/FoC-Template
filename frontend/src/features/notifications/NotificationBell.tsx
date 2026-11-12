/*
 * AI Assistance Disclosure
 * Tool and date: OpenAI Codex (gpt-6.1-sol), 2026-11-08
 * Scope (AI-07): Implemented and tested mark-as-read on notification clicks.
 * Usage log: AI_USAGE_LOG.md
 * Author review: Changes validated and confirmed.
 * AI Assistance Disclosure:
 * Tool: OpenAI Codex (GPT-5), date: 2026-11-09
 * Scope: Implementation and test assistance for chat notification previews.
 */
import { useEffect, useId, useRef, useState } from 'react'
import { Link } from 'react-router'
import { groupNotifications } from './notification.groups'
import { useNotifications } from './useNotifications'
import { useChatPreview } from '../chat/chat.preview'
import { getConversation } from '../chat/chat.api'
import { useAuth } from '../auth/useAuth'
import type { NotificationItem } from './notification.types'

function NotificationText({ item }: { item: NotificationItem }) {
  const { currentUserId } = useAuth()
  const [senderRole, setSenderRole] = useState<string | null>(null)
  const preview = useChatPreview(
    item.type === 'CHAT_MESSAGE' ? item.data.conversationId : undefined,
    item.type === 'CHAT_MESSAGE' ? item.data.messageId : undefined,
  )
  useEffect(() => {
    if (item.type !== 'CHAT_MESSAGE' || !item.data.conversationId) return
    let active = true
    void getConversation(item.data.conversationId).then((conversation) => {
      if (active) setSenderRole(conversation.requesterId === currentUserId ? 'your courier' : 'the requester')
    }).catch(() => {})
    return () => { active = false }
  }, [currentUserId, item])
  if (item.type !== 'CHAT_MESSAGE') return <>{item.message}</>
  return <>
    <span className="block">You received a new message{senderRole ? ` from ${senderRole}` : ''}</span>
    <span className="mt-1 block truncate font-normal text-[#53645a]">{preview ?? item.message}</span>
  </>
}

function destination(item: NotificationItem) {
  return item.type === 'CHAT_MESSAGE' && item.data.conversationId
    ? `/chats/${encodeURIComponent(item.data.conversationId)}`
    : `/errands/${encodeURIComponent(item.data.errandId)}`
}

export function NotificationBell() {
  const notifications = useNotifications()
  const [open, setOpen] = useState(false)
  const [pendingUpdates, setPendingUpdates] = useState(0)
  const [actionError, setActionError] = useState<string | null>(null)
  const root = useRef<HTMLDivElement>(null)
  const button = useRef<HTMLButtonElement>(null)
  const panelId = useId()

  useEffect(() => {
    if (!open) return
    function closeOutside(event: PointerEvent) {
      if (event.target instanceof Node && !root.current?.contains(event.target)) {
        setOpen(false)
      }
    }
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setOpen(false)
        button.current?.focus()
      }
    }
    document.addEventListener('pointerdown', closeOutside)
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.removeEventListener('pointerdown', closeOutside)
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [open])

  if (!notifications) return null
  const { items, unreadCount, historyStatus, connection, refresh, markRead, markAllRead } = notifications
  const updating = pendingUpdates > 0

  async function updateReadStatus(action: () => Promise<void>) {
    setPendingUpdates((count) => count + 1)
    setActionError(null)
    try {
      await action()
    } catch {
      setActionError('Could not update read status. Please try again.')
    } finally {
      setPendingUpdates((count) => count - 1)
    }
  }

  return (
    <div className="relative shrink-0" ref={root}>
      <button
        ref={button}
        type="button"
        aria-label={unreadCount ? `Notifications (${unreadCount} unread)` : 'Notifications'}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => {
          if (!open) void refresh()
          setOpen(!open)
        }}
        className="relative grid size-9 cursor-pointer place-items-center rounded-lg border border-[#cfd8d1] text-[#175c45] hover:bg-[#f0f6f2] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#175c45] lg:size-10"
      >
        <svg aria-hidden="true" className="size-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4" />
        </svg>
        {unreadCount ? (
          <span aria-hidden="true" className="absolute -right-1.5 -top-1.5 rounded-full bg-[#175c45] px-1.5 py-0.5 text-[10px] font-semibold leading-none text-white">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        ) : null}
      </button>

      {open ? (
        <section
          id={panelId}
          aria-label="Recent notifications"
          className="fixed inset-x-4 top-[4.5rem] z-50 overflow-hidden rounded-xl border border-[#dde3de] bg-white shadow-lg sm:absolute sm:inset-x-auto sm:right-0 sm:top-[calc(100%+0.75rem)] sm:w-88"
        >
          <div className="flex items-center justify-between gap-2 border-b border-[#dde3de] px-4 py-3">
            <h2 className="font-semibold">Notifications</h2>
            <button
              type="button"
              disabled={updating || (!unreadCount && !items.some((item) => !item.readAt))}
              onClick={() => void updateReadStatus(markAllRead)}
              className="cursor-pointer text-xs font-semibold text-[#175c45] hover:underline disabled:cursor-default disabled:opacity-45"
            >
              Mark all as read
            </button>
          </div>
          {connection === 'reconnecting' || connection === 'unavailable' ? (
            <p role="status" className="border-b border-[#dde3de] px-4 py-2 text-xs text-[#68736c]">
              {connection === 'reconnecting' ? 'Reconnecting to live updates…' : 'Live updates are unavailable.'}
            </p>
          ) : null}
          {historyStatus === 'error' ? (
            <div className="flex items-center justify-between gap-2 px-4 py-3 text-sm" role="alert">
              <span>Could not load notifications.</span>
              <button type="button" onClick={() => void refresh()} className="cursor-pointer font-semibold text-[#175c45] underline">Retry</button>
            </div>
          ) : null}
          {actionError ? <p role="alert" className="px-4 py-2 text-sm text-[#a13b31]">{actionError}</p> : null}
          {items.length === 0 && historyStatus !== 'error' ? (
            <p className="px-4 py-5 text-sm text-[#68736c]">
              {historyStatus === 'loading' ? 'Loading notifications…' : 'You have no recent notifications.'}
            </p>
          ) : null}
          <ul className="max-h-[min(25rem,60dvh)] divide-y divide-[#dde3de] overflow-y-auto">
            {groupNotifications(items).map(({ key, latest, related }) => {
              const unread = !latest.readAt || Boolean(related && !related.readAt)
              const markCardRead = () => markRead(related ? [latest.id, related.id] : [latest.id])
              return (
                <li key={key} className={unread ? 'bg-[#f0f6f2] px-4 py-3' : 'px-4 py-3'}>
                  <Link
                    to={destination(latest)}
                    onClick={() => {
                      setOpen(false)
                      if (unread) void updateReadStatus(markCardRead)
                    }}
                    className="block text-sm font-medium hover:underline"
                  >
                    {related ? (
                      <>
                        <span className="block">Errand completed</span>{' '}
                        <span className="block text-[#53645a]">
                          {(latest.type === 'CREDIT_RECEIVED' ? latest : related).message}
                        </span>
                      </>
                    ) : <NotificationText item={latest} />}
                  </Link>
                  <div className="mt-1 flex flex-wrap items-center justify-between gap-2 text-xs text-[#68736c]">
                    <time dateTime={latest.createdAt}>
                      {new Date(latest.createdAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}
                    </time>
                    {unread ? (
                      <button
                        type="button"
                        disabled={updating}
                        onClick={() => void updateReadStatus(markCardRead)}
                        className="cursor-pointer font-semibold text-[#175c45] hover:underline disabled:opacity-45"
                      >
                        Mark as read
                      </button>
                    ) : null}
                  </div>
                </li>
              )
            })}
          </ul>
        </section>
      ) : null}
    </div>
  )
}
