import { expireSession, readSession } from '../auth/session'

/** One notification as GET /api/notifications/me returns it (the shared contract's schema). */
export type NotificationItem = {
  id: string
  type: string
  orderId: string | null
  message: string
  occurredAt: string
  readAt: string | null
}

export type NotificationPage = {
  content: NotificationItem[]
  page: number
  size: number
  totalElements: number
  totalPages: number
}

export class NotificationApiError extends Error {
  readonly status: number

  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

/** Same-origin calls through the gateway with the signed-in user's token; 401 ends the session. */
async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const session = readSession()
  if (!session) throw new NotificationApiError(401, 'Sign in is required')
  const response = await fetch(path, {
    ...init,
    headers: { ...init.headers, Authorization: `${session.tokenType} ${session.accessToken}` },
  })
  if (response.status === 401) {
    expireSession()
    throw new NotificationApiError(401, 'Your session has expired')
  }
  if (!response.ok) {
    throw new NotificationApiError(response.status, 'We couldn’t load your notifications')
  }
  return (await response.json()) as T
}

export const pageSize = 20

export function listNotifications(page: number): Promise<NotificationPage> {
  return request<NotificationPage>(`/api/notifications/me?page=${page}&size=${pageSize}`)
}

export function markRead(id: string): Promise<NotificationItem> {
  return request<NotificationItem>(`/api/notifications/me/${encodeURIComponent(id)}/read`, {
    method: 'PATCH',
  })
}
