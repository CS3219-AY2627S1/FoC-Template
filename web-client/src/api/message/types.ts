// Mirrors the message JSON of message-service (models/message.model.ts). Change both together.
import type { Paginated } from '@/lib/http'

export type MessageStatus = 'unread' | 'read'

export type Message = {
  _id: string
  senderId: string
  receiverId: string
  // The errand the chat belongs to. Only the welcome message from Relay has none.
  orderId?: string
  content: string
  status: MessageStatus
  createdAt: string
  updatedAt: string
}

// One row per errand chat. Messages from Relay have no errand and form one row without orderId.
export type Conversation = {
  otherId: string
  orderId?: string
  lastMessage: Message
  unread: number
}

// GET /messages/orders/:orderId: one page of an errand's chat, plus who the other person on the
// errand is and whether the service still accepts messages for it.
export type ErrandConversation = Paginated<Message> & {
  otherId: string
  open: boolean
}

// What a socket acknowledgement carries when the service refused the event.
export type SocketError = { error: { code: string; message: string } }
