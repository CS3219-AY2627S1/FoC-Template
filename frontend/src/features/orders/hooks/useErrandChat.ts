import { useEffect, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { QueryClient } from '@tanstack/react-query'
import { useSession } from '#/features/auth/hooks/useSession'
import { connectRealtime } from '#/lib/realtime'
import {
  getChat,
  markChatRead,
  sendChatFile,
  sendMessage,
} from '../api/orders.api'
import { errandQueryKeys } from '../constants/errandQueryKeys'
import { chatIsOpen } from '../utils/orderPermissions'
import type {
  Chat,
  ChatRead,
  Errand,
  ErrandMessage,
} from '../types/errand.types'

// what the realtime service pushes, the file's link is fetched with the chat
export type PushedMessage = Omit<ErrandMessage, 'attachment'> & {
  attachmentType: 'IMAGE' | 'VIDEO' | null
}
type PushedRead = { errandId: string; readerId: string; lastReadAt: string }

// The newest item that matches
export const lastWhere = <T>(items: Array<T>, test: (item: T) => boolean) => {
  for (let index = items.length - 1; index >= 0; index--)
    if (test(items[index])) return items[index]
  return undefined
}

// Keep the valid photo link, so photos not reload each time
// the conversation is fetched again
const keepLink = (previous: ErrandMessage | undefined, next: ErrandMessage) =>
  previous?.attachment &&
  next.attachment &&
  Date.parse(previous.attachment.expiresAt) - Date.now() > 2 * 60_000
    ? { ...next, attachment: previous.attachment }
    : next

// A fetched conversation keeps the still-valid links it already had, so a
// refetch does not reload every photo and video
export const keepLinks = (previous: unknown, next: unknown) => {
  const old = previous as Chat | undefined
  const fresh = next as Chat
  if (!old) return fresh
  const byId = new Map(old.messages.map((message) => [message.id, message]))
  return {
    ...fresh,
    messages: fresh.messages.map((message) =>
      keepLink(byId.get(message.id), message),
    ),
  }
}

// How often to fetch the conversation again. Open: in case a message was
// missed. Closed: only to renew photo/video links before they expire (they
// last 10 minutes and are swapped when under 2 minutes are left).
export const chatRefetchInterval = (open: boolean, chat?: Chat) => {
  if (open) return 30_000
  return chat?.messages.some((message) => message.attachment) ? 60_000 : false
}

// Adds messages to the cached conversation, once each, oldest first
export const addMessages = (
  client: QueryClient,
  key: ReadonlyArray<unknown>,
  incoming: Array<ErrandMessage>,
) =>
  client.setQueryData<Chat>(key, (chat = { messages: [], reads: [] }) => {
    const byId = new Map(chat.messages.map((message) => [message.id, message]))
    incoming.forEach((message) =>
      byId.set(message.id, keepLink(byId.get(message.id), message)),
    )
    const messages = [...byId.values()].sort(
      (a, b) =>
        Date.parse(a.sentAt) - Date.parse(b.sentAt) || a.id.localeCompare(b.id),
    )
    return { ...chat, messages }
  })

// to move the read position forward
const addRead = (
  client: QueryClient,
  key: ReadonlyArray<unknown>,
  read: ChatRead,
) =>
  client.setQueryData<Chat>(key, (chat) => {
    if (!chat) return chat
    const current = chat.reads.find((item) => item.userId === read.userId)
    if (
      current &&
      Date.parse(current.lastReadAt) >= Date.parse(read.lastReadAt)
    )
      return chat
    return {
      ...chat,
      reads: [...chat.reads.filter((item) => item !== current), read],
    }
  })

// only when both visible & focused then the messages will be count as seen
export const useViewing = (element: HTMLElement | null) => {
  const [onScreen, setOnScreen] = useState(true)
  const [active, setActive] = useState(
    () => document.visibilityState === 'visible' && document.hasFocus(),
  )
  useEffect(() => {
    if (!element || typeof IntersectionObserver === 'undefined') return
    const observer = new IntersectionObserver(
      ([entry]) => setOnScreen(entry.isIntersecting),
      { threshold: 0.25 },
    )
    observer.observe(element)
    return () => observer.disconnect()
  }, [element])
  useEffect(() => {
    const update = () =>
      setActive(document.visibilityState === 'visible' && document.hasFocus())
    document.addEventListener('visibilitychange', update)
    window.addEventListener('focus', update)
    window.addEventListener('blur', update)
    return () => {
      document.removeEventListener('visibilitychange', update)
      window.removeEventListener('focus', update)
      window.removeEventListener('blur', update)
    }
  }, [])
  return onScreen && active
}

export const useErrandChat = (order: Errand, viewing: boolean) => {
  const { userId, roles } = useSession()
  const client = useQueryClient()
  const participant =
    !!userId &&
    !!order.courier &&
    (order.requester.id === userId || order.courier.id === userId)
  const readable = participant || roles.includes('ADMIN')
  const open = chatIsOpen(order)
  // pushed messages arrive through the realtime connection while it is open
  const live = participant && open
  // null while connecting, false once it has failed for a few seconds
  const [connected, setConnected] = useState<boolean | null>(null)

  const chat = useQuery({
    queryKey: errandQueryKeys.messages(userId, order.id),
    queryFn: ({ signal }) => getChat(order.id, signal),
    enabled: readable && !!order.courier,
    refetchInterval: (query) => chatRefetchInterval(open, query.state.data),
    structuralSharing: keepLinks,
    refetchOnWindowFocus: 'always',
    retry: false,
  })

  useEffect(() => {
    if (!live) return
    const key = errandQueryKeys.messages(userId, order.id)
    const controller = new AbortController()
    const socket = connectRealtime(controller.signal)
    const refetch = () =>
      void client.invalidateQueries({ queryKey: key, exact: true })
    const onMessage = (message: PushedMessage) => {
      if (message.errandId !== order.id) return
      const { attachmentType, ...rest } = message
      // A file's link comes with the conversation, so fetch it.
      if (attachmentType) refetch()
      else addMessages(client, key, [{ ...rest, attachment: null }])
    }
    const onRead = ({ errandId, readerId, lastReadAt }: PushedRead) => {
      if (errandId === order.id)
        addRead(client, key, { userId: readerId, lastReadAt })
    }
    // After re-connect or connect, catch anything sent offline
    const onConnect = () => {
      setConnected(true)
      refetch()
    }
    const onDisconnect = () => setConnected(false)
    const slow = setTimeout(
      () => setConnected((now) => (now === null ? false : now)),
      4_000,
    )
    socket.on('errand.message', onMessage)
    socket.on('errand.read', onRead)
    socket.on('connect', onConnect)
    socket.on('disconnect', onDisconnect)
    return () => {
      clearTimeout(slow)
      socket.off('errand.message', onMessage)
      socket.off('errand.read', onRead)
      socket.off('connect', onConnect)
      socket.off('disconnect', onDisconnect)
      controller.abort()
      setConnected(null)
    }
  }, [live, client, userId, order.id])

  // tell the other person alr seen the message
  const reported = useRef<string | null>(null)
  const latestFromOther = participant
    ? lastWhere(
        chat.data?.messages ?? [],
        (message) => message.senderId !== userId,
      )
    : undefined
  const myRead = chat.data?.reads.find((read) => read.userId === userId)
  const unread =
    !!latestFromOther &&
    (!myRead ||
      Date.parse(myRead.lastReadAt) < Date.parse(latestFromOther.sentAt))
  useEffect(() => {
    if (!viewing || !unread || !userId) return
    if (reported.current === latestFromOther.id) return
    reported.current = latestFromOther.id
    const key = errandQueryKeys.messages(userId, order.id)
    markChatRead(order.id, latestFromOther.id)
      .then(() =>
        addRead(client, key, { userId, lastReadAt: latestFromOther.sentAt }),
      )
      .catch(() => {
        reported.current = null
      })
  }, [viewing, unread, latestFromOther, userId, order.id, client])

  const key = errandQueryKeys.messages(userId, order.id)
  const send = useMutation({
    networkMode: 'always',
    retry: false,
    mutationFn: (message: { id: string; body: string }) =>
      sendMessage(order.id, message),
    onSuccess: (message) => addMessages(client, key, [message]),
  })
  const sendFile = useMutation({
    networkMode: 'always',
    retry: false,
    mutationFn: ({ id, file }: { id: string; file: File }) =>
      sendChatFile(order.id, id, file),
    onSuccess: (message) => addMessages(client, key, [message]),
  })

  return {
    chat,
    send,
    sendFile,
    userId,
    participant,
    readable,
    open,
    reconnecting: live && connected === false,
  }
}
