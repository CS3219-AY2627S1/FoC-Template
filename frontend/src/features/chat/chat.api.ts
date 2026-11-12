/*
 * AI Assistance Disclosure:
 * Tool: OpenAI Codex (GPT-5), date: 2026-11-10
 * Scope: Implementation, refactoring, and test assistance for the recorded frontend work.
 */
import { authenticatedFetch } from '../auth/auth.fetch'
import type { ChatMessage, Conversation, ConversationListItem } from './chat.types'

const baseUrl = (import.meta.env.VITE_CHAT_API_URL ?? 'http://localhost:8003').trim().replace(/\/+$/, '')

type RawMessage = { id: string; conversation_id: string; sender_id: string; client_message_id: string; sequence_number: number; content: string; created_at: string }
type RawConversation = { id: string; errand_id: string; requester_id: string; courier_id: string; delivery_status: string; expires_at: string | null; chat_closes_at: string | null; writable: boolean }

export function mapMessage(value: RawMessage): ChatMessage {
  return { id: value.id, conversationId: value.conversation_id, senderId: value.sender_id, clientMessageId: value.client_message_id, sequenceNumber: value.sequence_number, content: value.content, createdAt: value.created_at }
}

function mapConversation(value: RawConversation): Conversation {
  return { id: value.id, errandId: value.errand_id, requesterId: value.requester_id, courierId: value.courier_id, deliveryStatus: value.delivery_status, expiresAt: value.expires_at, chatClosesAt: value.chat_closes_at, writable: value.writable }
}

async function json(path: string, init: RequestInit = {}) {
  const response = await authenticatedFetch(`${baseUrl}${path}`, { headers: { Accept: 'application/json', ...init.headers }, ...init })
  if (!response.ok) throw new Error(response.status === 404 ? 'Chat not found.' : 'Could not load chat.')
  return response.json()
}

export async function listConversations(signal?: AbortSignal): Promise<ConversationListItem[]> {
  const body = await json('/conversations?limit=50', { signal }) as { items: Array<RawConversation & { last_message: RawMessage | null }> }
  return body.items.map((item) => ({ ...mapConversation(item), lastMessage: item.last_message ? mapMessage(item.last_message) : null }))
}

export async function getConversationForErrand(errandId: string, signal?: AbortSignal): Promise<Conversation | null> {
  const response = await authenticatedFetch(`${baseUrl}/conversations/by-errand/${encodeURIComponent(errandId)}`, { signal })
  if (response.status === 202) return null
  if (!response.ok) throw new Error('Could not open chat.')
  return mapConversation(await response.json() as RawConversation)
}

export async function getMessages(conversationId: string, signal?: AbortSignal): Promise<ChatMessage[]> {
  const body = await json(`/conversations/${encodeURIComponent(conversationId)}/messages?limit=100`, { signal }) as { items: RawMessage[] }
  return body.items.map(mapMessage)
}

export async function getConversation(conversationId: string, signal?: AbortSignal): Promise<Conversation> {
  return mapConversation(await json(`/conversations/${encodeURIComponent(conversationId)}`, { signal }) as RawConversation)
}

export async function getMessage(conversationId: string, messageId: string, signal?: AbortSignal): Promise<ChatMessage> {
  return mapMessage(await json(`/conversations/${encodeURIComponent(conversationId)}/messages/${encodeURIComponent(messageId)}`, { signal }) as RawMessage)
}

export async function createWebSocketTicket(conversationId: string): Promise<{ ticket: string; expiresAt: string }> {
  const value = await json(`/conversations/${encodeURIComponent(conversationId)}/ws-ticket`, { method: 'POST' }) as { ticket: string; expires_at: string }
  return { ticket: value.ticket, expiresAt: value.expires_at }
}

export function chatWebSocketUrl(conversationId: string, ticket: string) {
  const url = new URL(`${baseUrl}/conversations/${encodeURIComponent(conversationId)}/ws`)
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
  url.searchParams.set('ticket', ticket)
  return url.toString()
}
