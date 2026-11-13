// AI Assistance Disclosure:
// Tool: Claude Code (model: claude-opus-5-5), date: 2026-11-11
// Scope: Writing implementation code — the /notifications page: server-rendered first page and the admin-view redirect (ai-20261111-001).
// Author review: Not confirmed (pending).
// Details: frontend-service/ai/usage-log.md; ai-20261111-001

import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { NotificationList } from '@/components/notifications/notification-list';
import { loadFirstNotificationPage } from '@/lib/notification-service';
import { isAdminView } from '@/lib/session';

export const metadata: Metadata = {
  title: 'Notifications · Friend on Campus',
};

export default async function NotificationsPage() {
  // Notifications belong to the user view; see the main layout.
  if (await isAdminView()) redirect('/admin/users');
  return <NotificationList initial={await loadFirstNotificationPage()} />;
}
