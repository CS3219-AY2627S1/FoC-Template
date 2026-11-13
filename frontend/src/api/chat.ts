// Frontend API client for the chat service: live chat between an errand's requester and courier.
// Sending goes through REST; live updates arrive over the WebSocket (see stores/chat.ts).
import * as TokenStore from '@/auth/tokenStorage'
import client from './http'

const BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api'

export type MessageType = 'TEXT' | 'IMAGE'

export interface ChatMessage {
  // only goes up: orders messages and pages history
  id: number
  errandId: string
  senderId: number
  type: MessageType
  // the text; null for an image
  body: string | null
  // e.g. "/public/chat/images/12"; null for text. Use imageSrc() to show it
  imageUrl: string | null
  clientMessageId: string
  // ISO 8601
  createdAt: string
}

// a chat from the signed-in user's point of view; one per errand, between its requester and courier
export interface ChatSummary {
  // the order id
  errandId: string
  requesterId: number | null
  courierId: number | null
  // the person the signed-in user is talking to
  otherUserId: number | null
  // null while the errand is in progress, then DELIVERED or CANCELLED (cancelled includes expired)
  endReason: 'DELIVERED' | 'CANCELLED' | null
  // when the chat is deleted; set once the errand ends
  deleteAt: string | null
  unreadCount: number
  lastMessage: ChatMessage | null
  createdAt: string
}

export interface MessagePage {
  // oldest first
  data: ChatMessage[]
  // whether older messages exist before the first one returned
  hasMore: boolean
}

// pushed over the WebSocket
export type ChatEvent
  = | { type: 'message', message: ChatMessage }
    | { type: 'chat.opened' | 'chat.updated', chat: ChatSummary }
    | { type: 'chat.deleted', errandId: string }
    | { type: 'pong' }

// the service's limits
export const MAX_TEXT_LENGTH = 2000
export const MAX_IMAGE_BYTES = 2 * 1024 * 1024
export const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp']

// the signed-in user's chats, most recently active first
export async function listChats () {
  const response = await client.get<{ data: ChatSummary[] }>('/public/chat/chats')
  return response.data.data
}

// one chat; 404 unless the signed-in user is its requester or courier
export async function getChat (errandId: string) {
  const response = await client.get<ChatSummary>(`/public/chat/chats/${errandId}`)
  return response.data
}

// a page of messages, oldest first; pass the oldest loaded id as `before` for older ones
export async function listMessages (errandId: string, options: { limit?: number, before?: number } = {}) {
  const params: Record<string, string> = {}
  if (options.limit !== undefined) {
    params.limit = String(options.limit)
  }
  if (options.before !== undefined) {
    params.before = String(options.before)
  }
  const response = await client.get<MessagePage>(`/public/chat/chats/${errandId}/messages`, { params })
  return response.data
}

// resending with the same clientMessageId (a retry) returns the first message instead of a duplicate
export async function sendText (errandId: string, body: string, clientMessageId: string) {
  const response = await client.post<ChatMessage>(`/public/chat/chats/${errandId}/messages`, { clientMessageId, body })
  return response.data
}

export async function sendImage (errandId: string, image: File, clientMessageId: string) {
  const form = new FormData()
  form.append('image', image)
  form.append('clientMessageId', clientMessageId)
  const response = await client.post<ChatMessage>(`/public/chat/chats/${errandId}/images`, form)
  return response.data
}

export async function markRead (errandId: string) {
  await client.post(`/public/chat/chats/${errandId}/read`)
}

// an <img> cannot send the login header, so the token goes in the address
export function imageSrc (message: ChatMessage): string | null {
  if (!message.imageUrl) {
    return null
  }
  const token = TokenStore.getAccessToken()
  return `${BASE_URL}${message.imageUrl}${token ? `?token=${encodeURIComponent(token)}` : ''}`
}

// the live-update socket, through the same /api prefix as everything else
export function socketUrl (token: string): string {
  const base = new URL(BASE_URL, window.location.href)
  base.protocol = base.protocol === 'https:' ? 'wss:' : 'ws:'
  base.pathname = `${base.pathname.replace(/\/$/, '')}/public/chat/ws`
  base.search = `?token=${encodeURIComponent(token)}`
  return base.toString()
}
