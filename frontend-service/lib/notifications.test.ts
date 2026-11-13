// AI Assistance Disclosure:
// Tool: Claude Code (model: claude-opus-5-5), date: 2026-11-11
// Scope: Writing implementation code — unit tests for the badge count and notification link helpers (ai-20261111-001).
// Author review: Not confirmed (pending).
// Details: frontend-service/ai/usage-log.md; ai-20261111-001

import { describe, expect, it } from 'vitest';

import {
  type AppNotification,
  formatUnreadCount,
  notificationHref,
} from '@/lib/notifications';

function notification(role: AppNotification['recipient_role']) {
  return { recipient_role: role } as AppNotification;
}

describe('formatUnreadCount', () => {
  it('caps the badge at 99+', () => {
    expect(formatUnreadCount(1)).toBe('1');
    expect(formatUnreadCount(99)).toBe('99');
    expect(formatUnreadCount(100)).toBe('99+');
  });
});

describe('notificationHref', () => {
  it("opens the Orders tab for the recipient's role", () => {
    expect(notificationHref(notification('requester'))).toBe('/orders');
    expect(notificationHref(notification('courier'))).toBe(
      '/orders?role=courier',
    );
  });
});
