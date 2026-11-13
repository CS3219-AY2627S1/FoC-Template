import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { type ChatEvent, type ChatSummary, listChats, socketUrl } from '@/api/chat'
import { tryRefreshToken } from '@/api/http'
import * as TokenStore from '@/auth/tokenStorage'
import { useAuthStore } from '@/stores/auth'

// the server closes the socket with this code when the access token expires
const TOKEN_EXPIRED_CLOSE = 4401
// wait before reconnecting after a dropped connection, doubling up to the maximum
const RECONNECT_MIN_MS = 2000
const RECONNECT_MAX_MS = 30_000

type Listener = (event: ChatEvent) => void

// most recently active first: by the last message, or when the chat opened
function activity (chat: ChatSummary): string {
  return chat.lastMessage?.createdAt ?? chat.createdAt
}

/**
 * The signed-in user's chats and the one live-update connection the whole app shares.
 * The open chat panel subscribes to the pushes it needs; the menu shows the unread total.
 */
export const useChatStore = defineStore('chat', () => {
  const auth = useAuthStore()

  const chats = ref<ChatSummary[]>([])
  const isLoaded = ref(false)
  const loadFailed = ref(false)
  const isConnected = ref(false)
  // the chat currently on screen: its new messages are read straight away, so they are not counted
  const activeErrandId = ref<string | null>(null)

  const totalUnread = computed(() => chats.value.reduce((sum, c) => sum + c.unreadCount, 0))
  const myId = computed(() => auth.userId === null ? null : Number(auth.userId))

  const listeners = new Set<Listener>()
  let socket: WebSocket | null = null
  let reconnectTimer: ReturnType<typeof setTimeout> | undefined
  let reconnectDelay = RECONNECT_MIN_MS
  // false once the user logs out, so a closing socket does not reconnect
  let wanted = false

  function sortChats () {
    // a sorted copy (toSorted() is not in this project's TypeScript lib yet)
    const sorted = [...chats.value]

    sorted.sort((a, b) => activity(b).localeCompare(activity(a)))
    chats.value = sorted
  }

  function upsert (chat: ChatSummary) {
    const others = chats.value.filter(c => c.errandId !== chat.errandId)
    chats.value = [...others, chat]
    sortChats()
  }

  async function refresh () {
    try {
      chats.value = await listChats()
      sortChats()
      loadFailed.value = false
    } catch (error) {
      console.error('Error loading chats', error)
      loadFailed.value = true
    } finally {
      isLoaded.value = true
    }
  }

  function handle (event: ChatEvent) {
    switch (event.type) {
      case 'message': {
        const { message } = event
        const chat = chats.value.find(c => c.errandId === message.errandId)
        if (chat) {
          const counts = message.senderId !== myId.value && activeErrandId.value !== message.errandId
          upsert({ ...chat, lastMessage: message, unreadCount: chat.unreadCount + (counts ? 1 : 0) })
        } else {
          // a chat we have not loaded yet: fetch the list so it appears with the right counts
          void refresh()
        }
        break
      }
      case 'chat.opened':
      case 'chat.updated': {
        upsert(event.chat)
        break
      }
      case 'chat.deleted': {
        chats.value = chats.value.filter(c => c.errandId !== event.errandId)
        break
      }
    }
    for (const listener of listeners) {
      listener(event)
    }
  }

  function scheduleReconnect () {
    clearTimeout(reconnectTimer)
    reconnectTimer = setTimeout(connect, reconnectDelay)
    reconnectDelay = Math.min(reconnectDelay * 2, RECONNECT_MAX_MS)
  }

  function connect () {
    wanted = true
    const token = TokenStore.getAccessToken()
    if (!token || socket) {
      return
    }
    const ws = new WebSocket(socketUrl(token))
    socket = ws

    ws.addEventListener('open', () => {
      isConnected.value = true
      reconnectDelay = RECONNECT_MIN_MS
      // catch up on anything that changed while disconnected
      void refresh()
    })
    ws.addEventListener('message', e => {
      try {
        handle(JSON.parse(e.data) as ChatEvent)
      } catch (error) {
        console.warn('Ignoring a chat push that could not be read', error)
      }
    })
    ws.addEventListener('close', async e => {
      socket = null
      isConnected.value = false
      if (!wanted) {
        return
      }
      if (e.code === TOKEN_EXPIRED_CLOSE) {
        // reconnect straight away with a fresh token; if refreshing fails the user is logged out
        try {
          await tryRefreshToken()
          connect()
          return
        } catch {
          return
        }
      }
      scheduleReconnect()
    })
  }

  // on logout: stop reconnecting and forget everything
  function disconnect () {
    wanted = false
    clearTimeout(reconnectTimer)
    socket?.close()
    socket = null
    isConnected.value = false
    chats.value = []
    isLoaded.value = false
  }

  /** Receive every push while subscribed; returns the function that unsubscribes. */
  function subscribe (listener: Listener): () => void {
    listeners.add(listener)
    return () => listeners.delete(listener)
  }

  // the open panel marks the chat read on the server, and the count drops here at once
  function clearUnread (errandId: string) {
    const chat = chats.value.find(c => c.errandId === errandId)
    if (chat && chat.unreadCount > 0) {
      upsert({ ...chat, unreadCount: 0 })
    }
  }

  // the open panel keeps the list in step when it sends or receives a message
  function noteMessage (chat: ChatSummary) {
    upsert(chat)
  }

  return {
    chats,
    isLoaded,
    loadFailed,
    isConnected,
    activeErrandId,
    totalUnread,
    refresh,
    connect,
    disconnect,
    subscribe,
    clearUnread,
    noteMessage,
  }
})
