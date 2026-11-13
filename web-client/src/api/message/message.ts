import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { request } from '@/lib/http'
import type { Paginated } from '@/lib/http'
import type { Conversation, ErrandConversation, Message } from './types'

// The id the message-service uses as the sender of messages from Relay itself.
export const SYSTEM_SENDER_ID = '0'

export const messageKeys = {
  all: ['message'] as const,
  conversations: ['message', 'conversations'] as const,
  conversation: (accountId: string, otherId: string) => ['message', 'conversation', accountId, otherId] as const,
  errand: (orderId: string, errandStatus: string) => ['message', 'errand', orderId, errandStatus] as const,
}

export function useConversations() {
  return useQuery({
    queryKey: messageKeys.conversations,
    queryFn: ({ signal }) => request<Conversation[]>('message', '/messages/conversations', { signal }),
  })
}

export function useConversation(accountId: string, otherId: string) {
  return useInfiniteQuery({
    queryKey: messageKeys.conversation(accountId, otherId),
    initialPageParam: 1,
    queryFn: ({ pageParam, signal }) =>
      request<Paginated<Message>>('message', `/messages/${accountId}/${otherId}`, { query: { page: pageParam }, signal }),
    getNextPageParam: (last) => (last.page * last.pageSize < last.total ? last.page + 1 : undefined),
  })
}

// The chat of one errand. Refused (403) unless the account is its requester or courier.
// Messages are sent over the socket, see MessageComposer.
// errandStatus is not sent; it is in the key so the chat asks again whether it is open once the errand moves on.
export function useErrandConversation(orderId: string, errandStatus: string) {
  return useInfiniteQuery({
    queryKey: messageKeys.errand(orderId, errandStatus),
    initialPageParam: 1,
    queryFn: ({ pageParam, signal }) =>
      request<ErrandConversation>('message', `/messages/orders/${orderId}`, { query: { page: pageParam }, signal }),
    getNextPageParam: (last) => (last.page * last.pageSize < last.total ? last.page + 1 : undefined),
  })
}
