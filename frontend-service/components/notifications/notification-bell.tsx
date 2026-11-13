'use client';

// AI Assistance Disclosure:
// Tool: Claude Code (model: claude-opus-5-5), date: 2026-11-11
// Scope: Writing implementation code — the unread badge, the desktop "Alerts" navigation link, and the mobile top bar with the bell (ai-20261111-001).
// Author review: Not confirmed (pending).
// Details: frontend-service/ai/usage-log.md; ai-20261111-001

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Bell } from 'lucide-react';

import { useNotifications } from '@/components/notifications/notification-provider';
import { formatUnreadCount } from '@/lib/notifications';
import { cn } from '@/lib/utils';

const NOTIFICATIONS_HREF = '/notifications';

function bellLabel(unread: number | null) {
  if (!unread) return 'Notifications';
  return `Notifications, ${unread} unread`;
}

function UnreadBadge({
  count,
  className,
}: {
  count: number | null;
  className?: string;
}) {
  if (!count) return null;
  return (
    <span
      aria-hidden
      className={cn(
        'grid h-5 min-w-5 place-items-center rounded-full bg-red-500 px-1.5 text-[11px] leading-none font-bold text-white',
        className,
      )}
    >
      {formatUnreadCount(count)}
    </span>
  );
}

/** The "Alerts" entry in the desktop side navigation. */
export function NotificationNavLink() {
  const { unread } = useNotifications();
  const active = usePathname() === NOTIFICATIONS_HREF;

  return (
    <Link
      href={NOTIFICATIONS_HREF}
      aria-current={active ? 'page' : undefined}
      aria-label={bellLabel(unread)}
      className={cn(
        'flex h-11 items-center gap-3 rounded-xl px-3 text-sm font-medium transition-colors',
        active
          ? 'bg-brand-tint text-brand-strong'
          : 'text-slate-600 hover:bg-slate-50',
      )}
    >
      <Bell className='size-5' aria-hidden />
      Alerts
      <UnreadBadge count={unread} className='ml-auto' />
    </Link>
  );
}

/**
 * Mobile only: the bottom tab bar is full, so the bell sits in a slim bar
 * above each page's own header, which scrolls away with the page.
 */
export function MobileTopBar() {
  const { unread } = useNotifications();
  const active = usePathname() === NOTIFICATIONS_HREF;

  return (
    <div className='flex items-center justify-between bg-white px-4 pt-3 md:hidden'>
      <Link href='/home' className='flex items-center gap-2'>
        <span className='bg-brand grid size-8 place-items-center rounded-lg text-xs font-extrabold text-white'>
          FoC
        </span>
        <span className='text-base font-bold text-slate-900'>
          Friend on Campus
        </span>
      </Link>
      <Link
        href={NOTIFICATIONS_HREF}
        aria-current={active ? 'page' : undefined}
        aria-label={bellLabel(unread)}
        className={cn(
          'relative grid size-10 place-items-center rounded-full transition-colors',
          active
            ? 'bg-brand-tint text-brand-strong'
            : 'text-slate-600 hover:bg-slate-100',
        )}
      >
        <Bell className='size-6' aria-hidden />
        <UnreadBadge
          count={unread}
          className='absolute -top-0.5 -right-0.5 ring-2 ring-white'
        />
      </Link>
    </div>
  );
}
