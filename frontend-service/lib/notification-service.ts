// AI Assistance Disclosure:
// Tool: Claude Code (model: claude-opus-5-5), date: 2026-11-11
// Scope: Writing implementation code — the NOTIFICATION_SERVICE_URL setting and the server-side first-page read for /notifications (ai-20261111-001).
// Author review: Not confirmed (pending).
// Details: frontend-service/ai/usage-log.md; ai-20261111-001

/**
 * Server-side client for Notification Service, for Server Components. The
 * browser goes through the `/api/notifications` relay routes instead
 * (`lib/notification-relay.ts`).
 */

import 'server-only';

import { toResult } from '@/lib/action-result';
import {
  NOTIFICATION_PAGE_SIZE,
  type NotificationPage,
} from '@/lib/notifications';
import { createServiceRequest, withQuery } from '@/lib/service-request';
import { getSessionToken } from '@/lib/session';

export function notificationServiceUrl() {
  return process.env.NOTIFICATION_SERVICE_URL ?? 'http://127.0.0.1:8084';
}

/** The caller's newest notifications, for the first render of the page. */
export async function loadFirstNotificationPage() {
  const request = createServiceRequest(
    notificationServiceUrl(),
    'Notification Service',
  );
  return toResult(async () => {
    const page = await request<NotificationPage>(
      withQuery('/notifications', { limit: NOTIFICATION_PAGE_SIZE }),
      { token: await getSessionToken() },
    );
    return page;
  });
}
