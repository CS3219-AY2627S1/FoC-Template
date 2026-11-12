/*
 * AI Assistance Disclosure:
 * Tool: OpenAI Codex (GPT-5), date: 2026-11-10
 * Scope: Implementation, refactoring, and test assistance for the recorded frontend work.
 */
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router'
import { chatWebSocketUrl, createWebSocketTicket, getConversation, getMessages, mapMessage } from '../features/chat/chat.api'
import type { ChatMessage, Conversation } from '../features/chat/chat.types'
import { useAuth } from '../features/auth/useAuth'
import { useNotifications } from '../features/notifications/useNotifications'
import { getErrand } from '../features/errands/errand.api'
import type { ErrandListItem } from '../features/errands/errand.types'

export function ChatPage() {
  const { conversationId = '' } = useParams()
  const { currentUserId } = useAuth()
  const notifications = useNotifications()
  const notificationItems = notifications?.items
  const subscribeToNotifications = notifications?.subscribe
  const hideNotifications = notifications?.hide
  const markNotificationsRead = notifications?.markRead
  const [conversation, setConversation] = useState<Conversation | null>(null)
  const [errand, setErrand] = useState<ErrandListItem | null>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [content, setContent] = useState('')
  const [status, setStatus] = useState<'loading' | 'connected' | 'unavailable'>('loading')
  const [newMessagesBelow, setNewMessagesBelow] = useState(false)
  const socket = useRef<WebSocket | null>(null)
  const messageList = useRef<HTMLOListElement | null>(null)
  const atBottom = useRef(true)
  const scrollAfterRender = useRef<ScrollBehavior | null>(null)

  function scrollToBottom(behavior: ScrollBehavior = 'smooth') {
    messageList.current?.scrollTo({ top: messageList.current.scrollHeight, behavior })
    atBottom.current = true
    setNewMessagesBelow(false)
  }

  useLayoutEffect(() => {
    const behavior = scrollAfterRender.current
    if (!behavior) return
    scrollAfterRender.current = null
    scrollToBottom(behavior)
  }, [messages])

  useEffect(() => {
    if (!notificationItems || !hideNotifications || !markNotificationsRead) return
    const unreadIds = notificationItems.flatMap((item) =>
      item.type === 'CHAT_MESSAGE'
        && item.data.conversationId === conversationId
        && !item.readAt ? [item.id] : [])
    if (unreadIds.length === 0) return
    hideNotifications(unreadIds)
    void markNotificationsRead(unreadIds)
  }, [conversationId, hideNotifications, markNotificationsRead, notificationItems])

  useEffect(() => {
    if (!subscribeToNotifications || !hideNotifications || !markNotificationsRead) return
    return subscribeToNotifications((signal) => {
      if (signal.type === 'notification' && signal.item.type === 'CHAT_MESSAGE'
          && signal.item.data.conversationId === conversationId) {
        hideNotifications([signal.item.id])
        void markNotificationsRead([signal.item.id])
      }
    })
  }, [conversationId, hideNotifications, markNotificationsRead, subscribeToNotifications])

  useEffect(() => {
    const controller = new AbortController()
    void Promise.all([getConversation(conversationId, controller.signal), getMessages(conversationId, controller.signal)])
      .then(([details, history]) => {
        setConversation(details)
        void getErrand(details.errandId, controller.signal).then(setErrand).catch(() => {})
        scrollAfterRender.current = 'auto'
        setMessages(history)
      })
      .catch(() => { if (!controller.signal.aborted) setStatus('unavailable') })
    void createWebSocketTicket(conversationId).then(({ ticket }) => {
      if (controller.signal.aborted) return
      const ws = new WebSocket(chatWebSocketUrl(conversationId, ticket))
      socket.current = ws
      ws.onopen = () => setStatus('connected')
      ws.onmessage = (event) => {
        const frame = JSON.parse(String(event.data)) as { type?: string; message?: Parameters<typeof mapMessage>[0] }
        if ((frame.type === 'message_created' || frame.type === 'message_acknowledged') && frame.message) {
          const message = mapMessage(frame.message)
          if (message.senderId === currentUserId || atBottom.current) {
            // Scroll only after React has rendered the new message, when scrollHeight is current.
            scrollAfterRender.current = 'auto'
          }
          setMessages((current) => [...new Map([...current, message].map((item) => [item.id, item])).values()].sort((a, b) => a.sequenceNumber - b.sequenceNumber))
          if (!atBottom.current && message.senderId !== currentUserId) setNewMessagesBelow(true)
        }
      }
      ws.onerror = () => setStatus('unavailable')
      ws.onclose = () => { if (!controller.signal.aborted) setStatus('unavailable') }
    }).catch(() => setStatus('unavailable'))
    return () => { controller.abort(); socket.current?.close(); socket.current = null }
  }, [conversationId, currentUserId])

  function send() {
    const value = content.trim()
    if (!value || socket.current?.readyState !== WebSocket.OPEN) return
    socket.current.send(JSON.stringify({ type: 'send_message', client_message_id: crypto.randomUUID(), content: value }))
    setContent('')
    // The message is added after the server acknowledges it; scroll in the layout effect above.
    scrollAfterRender.current = 'auto'
    atBottom.current = true
    setNewMessagesBelow(false)
  }

  return <section className="mx-auto max-w-3xl">
    <div className="flex items-center justify-between gap-3">
      <Link className="text-sm font-medium text-[#175c45] hover:underline" to="/chats">← All chats</Link>
      {conversation ? <Link className="text-sm font-medium text-[#175c45] hover:underline" to={`/errands/${conversation.errandId}`}>View errand</Link> : null}
    </div>
    <div className="mt-5 overflow-hidden rounded-[18px] border border-[#dde3de] bg-white shadow-sm">
      <header className="border-b border-[#dde3de] px-5 py-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="truncate text-xl font-medium">{errand?.required_item ?? 'Errand chat'}</h1>
            <p className="text-sm text-[#53645a]">Chat with {conversation ? (conversation.requesterId === currentUserId ? 'courier' : 'requester') : 'participant'}</p>
          </div>
          <p className="text-xs text-[#68736c]">{status === 'connected' ? 'Live' : status === 'loading' ? 'Connecting…' : 'Connection unavailable'}</p>
        </div>
      </header>
      <div className="relative">
      <ol ref={messageList} onScroll={(event) => {
        const element = event.currentTarget
        atBottom.current = element.scrollHeight - element.scrollTop - element.clientHeight < 32
        if (atBottom.current) setNewMessagesBelow(false)
      }} className="flex min-h-80 max-h-[55vh] flex-col gap-3 overflow-y-auto p-5">
        {messages.map((message) => <li key={message.id} className={`w-fit max-w-[80%] rounded-2xl px-4 py-2 text-sm ${message.senderId === currentUserId ? 'self-end bg-[#175c45] text-white' : 'self-start bg-[#f0f3f1]'}`}>
          <p className="whitespace-pre-wrap break-words">{message.content}</p>
          <time className="mt-1 block text-[10px] opacity-70">{new Date(message.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</time>
        </li>)}
        {conversation?.deliveryStatus === 'COMPLETED' && conversation.chatClosesAt ? (
          <li className="mx-auto mt-3 max-w-lg border-t border-[#dde3de] px-4 pt-4 text-center text-xs leading-5 text-[#68736c]">
            {conversation.writable
              ? `Errand completed. Chat will close at ${new Date(conversation.chatClosesAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}.`
              : `Errand completed. Chat closed at ${new Date(conversation.chatClosesAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })} and is now read-only.`}
          </li>
        ) : null}
      </ol>
      {newMessagesBelow ? <button type="button" aria-label="Jump to new messages" onClick={() => scrollToBottom()} className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full bg-[#175c45] px-3 py-2 text-xs font-semibold text-white shadow-lg">↓ New message</button> : null}
      </div>
      <form className="flex gap-2 border-t border-[#dde3de] p-4" onSubmit={(event) => { event.preventDefault(); send() }}>
        <input aria-label="Message" value={content} maxLength={2000} onChange={(event) => setContent(event.target.value)} disabled={!conversation?.writable || status !== 'connected'} className="min-w-0 flex-1 rounded-lg border border-[#bdc8c0] px-3 py-2 text-sm" placeholder={conversation?.writable ? 'Write a message…' : 'This chat is closed'} />
        <button disabled={!content.trim() || !conversation?.writable || status !== 'connected'} className="rounded-lg bg-[#175c45] px-4 text-sm font-semibold text-white disabled:opacity-50">Send</button>
      </form>
    </div>
  </section>
}
