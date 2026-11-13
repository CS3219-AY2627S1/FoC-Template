import type { OrderDispute } from './dispute.types'

export const ERRAND_STATUSES = [
  'CREATING',
  'CREATE_FAILED',
  'OPEN',
  'ACCEPTED',
  'PICKED_UP',
  'DELIVERED',
  'COMPLETED',
  'CANCELLED',
  'EXPIRED',
] as const
export type ErrandStatus = (typeof ERRAND_STATUSES)[number]
export type OrderAction = 'accept' | 'pickup' | 'complete' | 'cancel'
export type OrderUser = { id: string; name: string | null }
export type CreditState =
  'RESERVED' | 'SETTLEMENT_PENDING' | 'SETTLED' | 'RELEASE_PENDING' | 'RELEASED'
export type Errand = {
  id: string
  requester: OrderUser
  courier: OrderUser | null
  supplierId: string
  pickup: { name: string; address: string }
  deliveryLocation: string
  description: string
  notes: string
  creditReward: number
  status: ErrandStatus
  creditState: CreditState | null
  creationFailureCode: string | null
  createdAt: string
  updatedAt: string
  expiresAt: string
  acceptedAt: string | null
  pickedUpAt: string | null
  endedAt: string | null
  createRequestId: string | null
  deliveredAt: string | null
  hasDeliveryPhoto: boolean
  dispute: OrderDispute | null
}
// get the courier's photos of the delivery to view with a short live link
export type DeliveryPhoto = { id: string; url: string; expiresAt: string }
// the courier can keep up to this many photos per delivery
export const MAX_DELIVERY_PHOTOS = 5
// one chat message between the requester and courier: text, a photo or a
// video (body is null for a photo/video without text)
export type ChatAttachment = {
  type: 'IMAGE' | 'VIDEO'
  url: string
  expiresAt: string
}
export type ErrandMessage = {
  id: string
  errandId: string
  senderId: string
  body: string | null
  attachment: ChatAttachment | null
  sentAt: string
}
// the conversation, oldest first
export type ChatRead = { userId: string; lastReadAt: string }
export type Chat = { messages: Array<ErrandMessage>; reads: Array<ChatRead> }
export const MAX_MESSAGE_LENGTH = 1000
export type OrderErrorResponse = {
  code: string
  message: string
  errandId?: string
}
export type OrderPage = {
  items: Array<Errand>
  total: number
  page: number
  size: number
}
export type CreateOrderRequest = {
  createRequestId: string
  supplierId: string
  deliveryLocation: string
  description: string
  notes: string
  creditReward: number
  expiryMinutes: number
}
export type CreateOrderResponse = {
  errandId: string
  status: ErrandStatus
  creationFailureCode: string | null
  queryUrl: string
}
export type OrderActionResponse = {
  errandId: string
  status: ErrandStatus
  creditState: CreditState | null
}
export type MineParams = {
  as: 'all' | 'requester' | 'courier'
  view: 'all' | 'active' | 'history'
  page: number
  size: number
  // used to match searched item, pickup, delivery location
  q?: string
}
