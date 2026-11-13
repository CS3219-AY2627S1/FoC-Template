// AI Assistance Disclosure:
// Tool: Claude Code (model: claude-opus-5-5), date: 2026-11-11
// Scope: Writing implementation code — notification types, badge and link helpers, and the browser calls to the relay routes with the 401 redirect to /auth/expired (ai-20261111-001).
// Author review: Not confirmed (pending).
// Details: frontend-service/ai/usage-log.md; ai-20261111-001

/**
 * Notification types and the browser's calls to the `/api/notifications`
 * relay routes. Safe to import from client components: the relay adds the
 * session token on the server.
 */

import { SESSION_EXPIRED_PATH } from '@/lib/auth';

export type NotificationType =
  | 'order.opened'
  | 'order.rejected'
  | 'order.accepted'
  | 'order.picked_up'
  | 'order.completed'
  | 'order.expired'
  | 'order.cancelled';

/** One notification, as Notification Service sends it everywhere. */
export type AppNotification = {
  /** Increases with creation order; the history cursor and SSE event id. */
  id: number;
  type: NotificationType | (string & {});
  recipient_role: 'requester' | 'courier';
  params: Record<string, unknown>;
  /** Fallback English text written by Notification Service. */
  title: string;
  body: string;
  order_id: string;
  occurred_at: string;
  created_at: string;
  read_at: string | null;
};

export type NotificationPage = {
  items: AppNotification[];
  /** Pass back as `cursor` for the next page; null on the last page. */
  next_cursor: number | null;
};

export const NOTIFICATION_PAGE_SIZE = 20;

export const NOTIFICATION_STREAM_PATH = '/api/notifications/stream';

export type ClientResult<T> =
  | { ok: true; data: T }
  | { ok: false; status: number; message: string };

/** Shown instead of a count above this; keeps the badge small. */
export function formatUnreadCount(count: number) {
  return count > 99 ? '99+' : String(count);
}

/** Where a notification leads: the Orders tab for the caller's role. */
export function notificationHref(notification: AppNotification) {
  return notification.recipient_role === 'courier'
    ? '/orders?role=courier'
    : '/orders';
}

function messageFor(status: number, body: unknown) {
  const detail = (body as { detail?: unknown } | null)?.detail;
  if (status === 503) return 'Notifications are unavailable right now.';
  return typeof detail === 'string' ? detail : 'Something went wrong.';
}

/**
 * Calls a relay route. A 401 means the session ended, so it goes to the
 * session-expired route, which confirms with User Service before logging
 * the user out.
 */
async function call<T>(
  path: string,
  method: 'GET' | 'POST' = 'GET',
): Promise<ClientResult<T>> {
  let response: Response;
  try {
    response = await fetch(path, { method, cache: 'no-store' });
  } catch {
    return { ok: false, status: 0, message: 'You appear to be offline.' };
  }
  const body: unknown = await response.json().catch(() => null);
  if (response.status === 401) {
    window.location.assign(SESSION_EXPIRED_PATH);
  }
  if (!response.ok || body === null) {
    return {
      ok: false,
      status: response.status,
      message: messageFor(response.status, body),
    };
  }
  return { ok: true, data: body as T };
}

export const notificationApi = {
  list(cursor?: number | null) {
    const query = new URLSearchParams({
      limit: String(NOTIFICATION_PAGE_SIZE),
    });
    if (cursor != null) query.set('cursor', String(cursor));
    return call<NotificationPage>(`/api/notifications?${query}`);
  },
  unreadCount() {
    return call<{ count: number }>('/api/notifications/unread-count');
  },
  markRead(id: number) {
    return call<AppNotification>(
      `/api/notifications/${encodeURIComponent(id)}/read`,
      'POST',
    );
  },
  markAllRead() {
    return call<{ updated: number }>('/api/notifications/read-all', 'POST');
  },
};
