'use client';

// AI Assistance Disclosure:
// Tool: Claude Code (model: claude-opus-5-5), date: 2026-11-11
// Scope: Writing implementation code — add the "Alerts" link to the side navigation in the user view (ai-20261111-001).
// Author review: Not confirmed (pending).
// Details: frontend-service/ai/usage-log.md; ai-20261111-001

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Award,
  CirclePlus,
  House,
  type LucideIcon,
  ShieldCheck,
  ShoppingBag,
  User,
  Users,
} from 'lucide-react';

import { useCreditBalance } from '@/components/credit-balance-provider';
import { NotificationNavLink } from '@/components/notifications/notification-bell';
import type { CreditBalanceResult } from '@/lib/credit-actions';
import { cn } from '@/lib/utils';

type NavItem = {
  label: string;
  href: string;
  icon: LucideIcon;
  disabled?: boolean;
};

/** Which navigation to show; administrators switch views on their profile. */
export type AppView = 'user' | 'admin';

// Order matches the mobile tab bar.
const NAV_ITEMS: NavItem[] = [
  { label: 'Feed', href: '/home', icon: House },
  { label: 'Orders', href: '/orders', icon: ShoppingBag },
  { label: 'Request', href: '/request', icon: CirclePlus },
  { label: 'Profile', href: '/profile', icon: User },
];

const ADMIN_NAV_ITEMS: NavItem[] = [
  { label: 'Users', href: '/admin/users', icon: Users },
  { label: 'Orders', href: '/admin/orders', icon: ShoppingBag },
  { label: 'Profile', href: '/profile', icon: User },
];

// Literal class names, so Tailwind generates them.
const GRID_COLUMNS: Record<number, string> = {
  3: 'grid-cols-3',
  4: 'grid-cols-4',
  5: 'grid-cols-5',
};

const HOME_HREF: Record<AppView, string> = {
  user: '/home',
  admin: '/admin/users',
};

function navItems(view: AppView) {
  return view === 'admin' ? ADMIN_NAV_ITEMS : NAV_ITEMS;
}

function useIsActive() {
  const pathname = usePathname();
  return (href: string) => pathname === href || pathname.startsWith(`${href}/`);
}

export function BottomNav({ view }: { view: AppView }) {
  const isActive = useIsActive();
  const items = navItems(view);

  return (
    <nav
      aria-label='Primary'
      className='fixed inset-x-0 bottom-0 z-40 border-t bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden'
    >
      <ul
        className={cn('mx-auto grid h-16 max-w-md', GRID_COLUMNS[items.length])}
      >
        {items.map(({ label, href, icon: Icon, disabled }) => {
          const active = isActive(href);
          const content = (
            <>
              <Icon
                className={cn('size-6', active && 'stroke-[2.25]')}
                aria-hidden
              />
              <span className='text-[11px] font-medium'>{label}</span>
            </>
          );
          const base =
            'flex h-full flex-col items-center justify-center gap-1 transition-colors';

          return (
            <li key={href}>
              {disabled ? (
                <span
                  aria-disabled
                  title='Coming soon'
                  className={cn(base, 'text-slate-300')}
                >
                  {content}
                </span>
              ) : (
                <Link
                  href={href}
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    base,
                    active
                      ? 'text-brand-strong'
                      : 'text-slate-400 hover:text-slate-600',
                  )}
                >
                  {content}
                </Link>
              )}
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

function balanceText(result: CreditBalanceResult) {
  if (!result.ok) return 'Unavailable';
  // Accounts open with the initial allocation on the first order.
  if (!result.balance) return 'No credits yet';
  return `${result.balance.available_balance} cr`;
}

export function SideNav({ view }: { view: AppView }) {
  const isActive = useIsActive();

  return (
    <aside className='fixed inset-y-0 left-0 z-40 hidden w-64 flex-col border-r bg-white px-4 py-6 md:flex'>
      <Link href={HOME_HREF[view]} className='flex items-center gap-2 px-2'>
        <span className='bg-brand grid size-9 place-items-center rounded-xl text-sm font-extrabold text-white'>
          FoC
        </span>
        <span className='text-lg leading-tight font-bold text-slate-900'>
          Friend on Campus
        </span>
      </Link>
      {view === 'admin' && (
        <p className='bg-courier-soft text-courier mt-4 flex items-center gap-1.5 self-start rounded-full px-3 py-1 text-xs font-semibold'>
          <ShieldCheck className='size-3.5' aria-hidden />
          Admin view
        </p>
      )}

      <nav aria-label='Primary' className='mt-8'>
        <ul className='space-y-1'>
          {navItems(view).map(({ label, href, icon: Icon, disabled }) => {
            const active = isActive(href);
            const base =
              'flex h-11 items-center gap-3 rounded-xl px-3 text-sm font-medium transition-colors';

            return (
              <li key={href}>
                {disabled ? (
                  <span
                    aria-disabled
                    className={cn(base, 'cursor-not-allowed text-slate-300')}
                  >
                    <Icon className='size-5' aria-hidden />
                    {label}
                    <span className='ml-auto rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-400 uppercase'>
                      Soon
                    </span>
                  </span>
                ) : (
                  <Link
                    href={href}
                    aria-current={active ? 'page' : undefined}
                    className={cn(
                      base,
                      active
                        ? 'bg-brand-tint text-brand-strong'
                        : 'text-slate-600 hover:bg-slate-50',
                    )}
                  >
                    <Icon className='size-5' aria-hidden />
                    {label}
                  </Link>
                )}
              </li>
            );
          })}
          {view === 'user' && (
            <li>
              <NotificationNavLink />
            </li>
          )}
        </ul>
      </nav>

      {view === 'user' && <CreditCard active={isActive('/credits')} />}
    </aside>
  );
}

function CreditCard({ active }: { active: boolean }) {
  const { credit } = useCreditBalance();

  return (
    <Link
      href='/credits'
      aria-current={active ? 'page' : undefined}
      className='border-brand-soft bg-brand-tint hover:border-brand/40 mt-auto rounded-2xl border p-4 transition-colors'
    >
      <p className='text-xs font-medium text-slate-500'>Available credit</p>
      <p className='text-brand-strong mt-1 flex items-center gap-1.5 text-2xl font-bold'>
        <Award className='size-5' aria-hidden />
        {balanceText(credit)}
      </p>
      {credit.ok && credit.balance && credit.balance.reserved_balance > 0 && (
        <p className='mt-1 text-xs text-slate-500'>
          {credit.balance.reserved_balance} cr held for open errands
        </p>
      )}
    </Link>
  );
}
