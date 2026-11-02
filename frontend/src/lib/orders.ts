export type OrderMode = "requester" | "courier"

export type OrderStatus =
  | "OPEN"
  | "ACCEPTED"
  | "IN_PROGRESS"
  | "PICKED_UP"
  | "DELIVERED"
  | "COMPLETED"
  | "CANCELLED"
  | "ABORTED"
  | "EXPIRED"

export type Order = {
  appliedPenalty?: string | null
  appliedPenaltyAmount?: number
  appliedPenaltyAt?: string | null
  appliedPenaltyBy?: string | null
  appliedPenaltyReason?: string | null
  id: string
  attemptId?: string | null
  requesterId: string
  courierId: string | null
  itemDescription: string
  pickupSupplierId: string
  deliverySupplierId: string
  offeredCredits: number
  status: OrderStatus
  isCompletionHold?: boolean
  overduePenaltyWaived?: boolean
  overdueWaivedAt?: string | null
  overdueWaivedBy?: string | null
  overdueWaiverReason?: string | null
  isOverdue?: boolean | null
  deliveryDeadlineAt?: string | null
  startedAt?: string | null
  deliveredAt?: string | null
  adminPenaltyDecision?: string | null
  adminPenaltyReason?: string | null
  adminPenaltyAmount?: number | null
  adminResolutionAt?: string | null
  adminResolutionReason?: string | null
  createdAt: string
  expiresAt: string
  deliveryTimeLimitMinutes: number
  version: number
  originalOrderId: string | null
  repostedOrderId: string | null
  automaticRepostEnabled?: boolean
  repostDueAt?: string | null
  repostExpiresAt?: string | null
  repostFailureCode?: string | null
  repostFailureMessage?: string | null
  repostFailureAt?: string | null
  repostCreditAmount?: number
  repostDeliveryDurationMinutes?: number
}

export type OrderPage = {
  items: Order[]
  page: number
  size: number
  totalItems: number
  totalPages: number
}

export type CreateOrderForm = {
  itemDescription: string
  pickupSupplierId: string
  deliverySupplierId: string
  offeredCredits: number
  deliveryTimeLimitMinutes: number
  expiresAt: string
  automaticRepost: boolean
  repostDueAt: string
  repostExpiresAt: string
  repostCreditAmount: number
  repostDeliveryDurationMinutes: number
}

export type CreateOrderPayload = {
  commandId: string
  requesterId: string
  itemDescription: string
  pickupSupplierId: string
  deliverySupplierId: string
  offeredCredits: number
  deliveryTimeLimitMinutes: number
  expiresAt: string
  automaticRepost: boolean
  repostDueAt: string | null
  repostExpiresAt: string | null
  repostCreditAmount: number
  repostDeliveryDurationMinutes: number
}

export type RepostConfigPayload = {
  commandId: string
  actorId: string
  expectedVersion: number
  enabled: boolean
  dueAt: string
  creditAmount: number
  deliveryDurationMinutes: number
}

export type OrderActionPayload = {
  commandId: string
  actorId: string
  expectedVersion: number
}

export const MIN_ORDER_EXPIRY_MINUTES = 30

export function minOrderExpiryDateTimeLocal(now = new Date()): string {
  return quarterHourDateTimeLocal(new Date(now.getTime() + MIN_ORDER_EXPIRY_MINUTES * 60_000))
}

export type OrderFieldErrors = Partial<Record<keyof CreateOrderForm, string>>

export function validateCreateOrderFields(form: CreateOrderForm, now = new Date()): OrderFieldErrors {
  const errors: OrderFieldErrors = {}
  if (!form.itemDescription.trim()) errors.itemDescription = "Describe what you need."
  else if (form.itemDescription.trim().length > 100) errors.itemDescription = "Description must be 100 characters or fewer."
  if (!form.pickupSupplierId.trim()) errors.pickupSupplierId = "Select a pickup supplier."
  if (!form.deliverySupplierId.trim()) errors.deliverySupplierId = "Select a delivery supplier."
  else if (form.pickupSupplierId.trim() === form.deliverySupplierId.trim()) {
    errors.deliverySupplierId = "Delivery supplier must differ from pickup supplier."
  }
  if (!Number.isSafeInteger(form.offeredCredits) || form.offeredCredits < 1) errors.offeredCredits = "Offered credits must be a whole number of at least 1."
  if (!Number.isInteger(form.deliveryTimeLimitMinutes) || form.deliveryTimeLimitMinutes < 15) errors.deliveryTimeLimitMinutes = "Delivery time must be a whole number of at least 15 minutes."
  const expiry = new Date(form.expiresAt)
  if (Number.isNaN(expiry.getTime())) errors.expiresAt = "Choose an order expiry time."
  else if (expiry.getTime() < now.getTime() + MIN_ORDER_EXPIRY_MINUTES * 60_000) errors.expiresAt = "Order expiry must be at least 30 minutes from now. Choose a later time."
  else if (!isQuarterHourDateTime(form.expiresAt)) errors.expiresAt = "Choose expiry minutes of 00, 15, 30, or 45."
  if (form.automaticRepost) {
    const repostDueAt = new Date(form.repostDueAt)
    if (Number.isNaN(repostDueAt.getTime())) errors.repostDueAt = "Choose a repost time when automatic repost is enabled."
    else if (!isQuarterHourDateTime(form.repostDueAt)) errors.repostDueAt = "Choose repost minutes of 00, 15, 30, or 45."
    else if (repostDueAt.getTime() < expiry.getTime()) errors.repostDueAt = "Repost time must be at or after the original order expiry."
    const repostExpiry = new Date(form.repostExpiresAt)
    if (Number.isNaN(repostExpiry.getTime())) errors.repostExpiresAt = "Choose a repost expiry when automatic repost is enabled."
    else if (!isQuarterHourDateTime(form.repostExpiresAt)) errors.repostExpiresAt = "Choose repost expiry minutes of 00, 15, 30, or 45."
    else if (repostExpiry.getTime() < repostDueAt.getTime() + MIN_ORDER_EXPIRY_MINUTES * 60_000) errors.repostExpiresAt = "Repost expiry must be at least 30 minutes after the repost time."
    if (!Number.isSafeInteger(form.repostCreditAmount) || form.repostCreditAmount < 1) errors.repostCreditAmount = "Repost credits must be at least 1."
    if (!Number.isInteger(form.repostDeliveryDurationMinutes) || form.repostDeliveryDurationMinutes < 15) errors.repostDeliveryDurationMinutes = "Repost delivery time must be at least 15 minutes."
  }
  return errors
}

export function validateCreateOrderForm(form: CreateOrderForm, now = new Date()): string | null {
  return Object.values(validateCreateOrderFields(form, now))[0] ?? null
}

const commandId = () => crypto.randomUUID()

export function orderMinePath(mode: OrderMode, userId: string, page = 1, status: OrderStatus | null = null): string {
  const params = new URLSearchParams({ mode, userId })
  params.set("page", String(Math.max(1, page)))
  params.set("size", "20")
  if (status) params.set("status", status)
  return `/api/orders/mine?${params.toString()}`
}

export function orderAvailablePath(page = 1): string {
  return `/api/orders/available?page=${Math.max(1, page)}&size=20`
}

export function buildCreateOrderPayload(form: CreateOrderForm, requesterId: string): CreateOrderPayload {
  return {
    commandId: commandId(),
    requesterId,
    itemDescription: form.itemDescription.trim(),
    pickupSupplierId: form.pickupSupplierId.trim(),
    deliverySupplierId: form.deliverySupplierId.trim(),
    offeredCredits: form.offeredCredits,
    deliveryTimeLimitMinutes: form.deliveryTimeLimitMinutes,
    expiresAt: new Date(form.expiresAt).toISOString(),
    automaticRepost: form.automaticRepost,
    repostDueAt: form.automaticRepost ? new Date(form.repostDueAt).toISOString() : null,
    repostExpiresAt: form.automaticRepost ? new Date(form.repostExpiresAt).toISOString() : null,
    repostCreditAmount: form.automaticRepost ? form.repostCreditAmount : 0,
    repostDeliveryDurationMinutes: form.automaticRepost ? form.repostDeliveryDurationMinutes : 0,
  }
}

export function buildRepostConfigPayload(form: CreateOrderForm, actorId: string, expectedVersion: number): RepostConfigPayload {
  return {
    commandId: commandId(),
    actorId,
    expectedVersion,
    enabled: form.automaticRepost,
    dueAt: new Date(form.repostDueAt).toISOString(),
    creditAmount: form.repostCreditAmount,
    deliveryDurationMinutes: form.repostDeliveryDurationMinutes,
  }
}

export function buildOrderActionPayload(actorId: string, expectedVersion: number): OrderActionPayload {
  return { commandId: commandId(), actorId, expectedVersion }
}

export function formatOrderStatus(status: OrderStatus): string {
  return status.replaceAll("_", " ").toLowerCase().replace(/(^| )\S/g, (letter) => letter.toUpperCase())
}

export function updateCourierOrderList(orders: Order[], updated: Order): Order[] {
  if (updated.status === "ABORTED" || (updated.status === "OPEN" && updated.courierId === null)) {
    return orders.filter((order) => order.attemptId || order.id !== updated.id)
  }

  return orders.map((order) => !order.attemptId && order.id === updated.id ? updated : order)
}

export function updateRequesterOrderList(orders: Order[], updated: Order): Order[] {
  if (updated.originalOrderId) {
    return [updated, ...orders.filter((order) => order.id !== updated.id &&
      !(order.id === updated.originalOrderId && order.status === "EXPIRED"))]
  }
  return orders.map((order) => order.id === updated.id ? updated : order)
}

export function isoToDateTimeLocal(iso: string): string {
  const date = new Date(iso)
  const offset = date.getTimezoneOffset() * 60_000
  return new Date(date.getTime() - offset).toISOString().slice(0, 16)
}

export function quarterHourDateTimeLocal(date: Date): string {
  const rounded = new Date(date.getTime())
  const minutes = rounded.getMinutes() + rounded.getSeconds() / 60 + rounded.getMilliseconds() / 60_000
  rounded.setMinutes(Math.ceil(minutes / 15) * 15, 0, 0)
  return isoToDateTimeLocal(rounded.toISOString())
}

export function isQuarterHourDateTime(value: string): boolean {
  const date = new Date(value)
  return !Number.isNaN(date.getTime()) && date.getMinutes() % 15 === 0
    && date.getSeconds() === 0 && date.getMilliseconds() === 0
}
