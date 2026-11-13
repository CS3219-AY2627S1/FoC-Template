'use client';

// AI Assistance Disclosure:
// Tool: Claude Code (model: claude-opus-5-5), date: 2026-11-11
// Scope: Writing implementation code — the /notifications list with live additions, cursor "Load more", "Mark all read", and mark-read on open before going to the Orders tab (ai-20261111-001).
// Author review: Not confirmed (pending).
// Details: frontend-service/ai/usage-log.md; ai-20261111-001

import { useEffect, useState, useTransition } from 'react';
import Link from 'next/link';
import {
  Ban,
  Bell,
  CheckCheck,
  CircleCheck,
  Clock,
  type LucideIcon,
  Megaphone,
  Package,
  Trophy,
} from 'lucide-react';

import { ErrorBanner, LoadMoreButton } from '@/components/list-controls';
import { useNotifications } from '@/components/notifications/notification-provider';
import { PageContainer, PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import type { ActionResult } from '@/lib/action-result';
import { formatDateTime } from '@/lib/format';
import {
  type AppNotification,
  type NotificationPage,
  notificationApi,
  notificationHref,
} from '@/lib/notifications';
import { cn } from '@/lib/utils';

const TYPE_ICONS: Record<string, LucideIcon> = {
  'order.opened': Megaphone,
  'order.accepted': CircleCheck,
  'order.picked_up': Package,
  'order.completed': Trophy,
  'order.expired': Clock,
  'order.rejected': Ban,
  'order.cancelled': Ban,
};

/** Adds items not already listed, keeping newest first. */
function merge(current: AppNotification[], incoming: AppNotification[]) {
  const seen = new Set(current.map((n) => n.id));
  const fresh = incoming.filter((n) => !seen.has(n.id));
  return [...current, ...fresh].sort((a, b) => b.id - a.id);
}

export function NotificationList({
  initial,
}: {
  initial: ActionResult<NotificationPage>;
}) {
  const { unread, noteRead, noteAllRead, subscribe } = useNotifications();
  const [items, setItems] = useState(initial.ok ? initial.items : []);
  const [nextCursor, setNextCursor] = useState(
    initial.ok ? initial.next_cursor : null,
  );
  const [error, setError] = useState(initial.ok ? null : initial.message);
  const [isLoading, startLoading] = useTransition();
  const [isMarking, startMarking] = useTransition();

  // New notifications appear at the top while the page is open.
  useEffect(
    () =>
      subscribe((notification) =>
        setItems((list) => merge(list, [notification])),
      ),
    [subscribe],
  );

  const loadMore = () =>
    startLoading(async () => {
      const result = await notificationApi.list(nextCursor);
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setError(null);
      setItems((list) => merge(list, result.data.items));
      setNextCursor(result.data.next_cursor);
    });

  const markAllRead = () =>
    startMarking(async () => {
      const result = await notificationApi.markAllRead();
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setError(null);
      const now = new Date().toISOString();
      setItems((list) =>
        list.map((n) => (n.read_at ? n : { ...n, read_at: now })),
      );
      noteAllRead();
    });

  const open = (notification: AppNotification) => {
    if (notification.read_at) return;
    // Navigation continues at once; the request finishes in the background.
    setItems((list) =>
      list.map((n) =>
        n.id === notification.id
          ? { ...n, read_at: new Date().toISOString() }
          : n,
      ),
    );
    noteRead();
    void notificationApi.markRead(notification.id);
  };

  const hasUnread = Boolean(unread) || items.some((n) => !n.read_at);

  return (
    <PageContainer>
      <PageHeader
        title='Notifications'
        actions={
          hasUnread && (
            <Button
              variant='outline'
              onClick={markAllRead}
              disabled={isMarking}
              className='h-10 rounded-xl font-semibold'
            >
              <CheckCheck aria-hidden />
              {isMarking ? 'Marking…' : 'Mark all read'}
            </Button>
          )
        }
      />

      <div className='space-y-3 px-4 pt-4 md:px-0'>
        {error && <ErrorBanner>{error}</ErrorBanner>}

        <ul className='divide-y rounded-2xl border bg-white'>
          {items.map((notification) => {
            const Icon = TYPE_ICONS[notification.type] ?? Bell;
            const isUnread = !notification.read_at;
            return (
              <li key={notification.id}>
                <Link
                  href={notificationHref(notification)}
                  onClick={() => open(notification)}
                  className={cn(
                    'flex items-start gap-3 px-4 py-3 transition-colors hover:bg-slate-50',
                    isUnread && 'bg-brand-tint/50',
                  )}
                >
                  <span
                    className={cn(
                      'mt-0.5 grid size-9 shrink-0 place-items-center rounded-full',
                      isUnread
                        ? 'bg-brand-soft text-brand-strong'
                        : 'bg-slate-100 text-slate-400',
                    )}
                  >
                    <Icon className='size-5' aria-hidden />
                  </span>
                  <span className='min-w-0 flex-1'>
                    <span
                      className={cn(
                        'block text-sm break-words',
                        isUnread
                          ? 'font-bold text-slate-900'
                          : 'font-semibold text-slate-700',
                      )}
                    >
                      {notification.title}
                      {isUnread && <span className='sr-only'> (unread)</span>}
                    </span>
                    <span className='block text-sm break-words text-slate-600'>
                      {notification.body}
                    </span>
                    <span className='mt-0.5 block text-xs text-slate-400'>
                      {formatDateTime(notification.occurred_at)}
                    </span>
                  </span>
                  {isUnread && (
                    <span
                      aria-hidden
                      className='bg-brand mt-2 size-2.5 shrink-0 rounded-full'
                    />
                  )}
                </Link>
              </li>
            );
          })}
          {!error && items.length === 0 && (
            <li className='px-4 py-10 text-center text-sm text-slate-500'>
              No notifications yet. Updates on your errands will show up here.
            </li>
          )}
        </ul>

        {nextCursor !== null && (
          <LoadMoreButton
            onClick={loadMore}
            loading={isLoading}
            className='pt-1'
          />
        )}
      </div>
    </PageContainer>
  );
}
