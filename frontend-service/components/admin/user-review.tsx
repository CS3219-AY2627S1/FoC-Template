'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { ArrowLeft, ShieldAlert, ShieldCheck, ShieldPlus } from 'lucide-react';

import { UserBadges } from '@/components/admin/user-badges';
import { Notice } from '@/components/auth/auth-layout';
import { ErrorBanner, LoadMoreButton } from '@/components/list-controls';
import { PageContainer, PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { usePagedList } from '@/components/use-paged-list';
import type { PageResult } from '@/lib/action-result';
import {
  loadUserTransactions,
  promoteToAdmin,
  reinstateAccount,
  suspendAccount,
} from '@/lib/admin-actions';
import { availableModeration, canPromote } from '@/lib/admin-users';
import type { CreditBalanceResult } from '@/lib/credit-actions';
import type { CreditTransaction } from '@/lib/credit-service';
import {
  type CreditChangeTone,
  describeTransaction,
  formatCreditChange,
} from '@/lib/credits';
import { formatDateTime } from '@/lib/format';
import type { User } from '@/lib/user-service';
import { cn } from '@/lib/utils';

const TONE_CLASSES: Record<CreditChangeTone, string> = {
  gain: 'text-emerald-700',
  loss: 'text-red-600',
  movement: 'text-slate-500',
  none: 'text-slate-400',
};

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className='rounded-2xl border bg-white p-5 shadow-sm'>
      <h2 className='text-base font-bold text-slate-900'>{title}</h2>
      {description && (
        <p className='mt-1 text-sm text-slate-500'>{description}</p>
      )}
      <div className='mt-4'>{children}</div>
    </section>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className='min-w-0'>
      <dt className='text-xs font-medium text-slate-500'>{label}</dt>
      <dd className='mt-0.5 text-sm break-all text-slate-900'>{value}</dd>
    </div>
  );
}

const MODERATION = {
  suspend: {
    prompt:
      'Suspending logs this user out everywhere. They cannot log in until an administrator reinstates the account.',
    start: 'Suspend account',
    confirm: 'Yes, suspend',
    pending: 'Suspending…',
    done: 'Account suspended.',
    run: suspendAccount,
    icon: ShieldAlert,
    className: 'bg-red-600 hover:bg-red-700',
  },
  reinstate: {
    prompt:
      'Reinstating makes the account active again. The user will need to log in again.',
    start: 'Reinstate account',
    confirm: 'Yes, reinstate',
    pending: 'Reinstating…',
    done: 'Account reinstated.',
    run: reinstateAccount,
    icon: ShieldCheck,
    className: 'bg-emerald-600 hover:bg-emerald-700',
  },
} as const;

function Moderation({
  user,
  actorId,
  onChange,
}: {
  user: User;
  actorId: string;
  onChange: (user: User) => void;
}) {
  const [isConfirming, setIsConfirming] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(
    null,
  );
  const { action, reason } = availableModeration(user, actorId);
  const noticeBanner = notice && (
    <Notice tone={notice.ok ? 'info' : 'error'}>{notice.text}</Notice>
  );

  if (!action) {
    return (
      <div className='space-y-3'>
        {noticeBanner}
        <p className='text-sm text-slate-600'>{reason}</p>
      </div>
    );
  }

  const copy = MODERATION[action];
  const Icon = copy.icon;
  const buttonClass = cn(
    'h-11 rounded-xl px-5 font-bold text-white',
    copy.className,
  );

  function run() {
    startTransition(async () => {
      const result = await copy.run(user.id).catch(() => null);
      setIsConfirming(false);
      if (result?.ok) {
        onChange(result.user);
        setNotice({ ok: true, text: copy.done });
      } else {
        setNotice({
          ok: false,
          text: result?.message ?? 'Something went wrong. Try again.',
        });
      }
    });
  }

  return (
    <div className='space-y-3'>
      {noticeBanner}
      {isConfirming ? (
        <>
          <p className='text-sm text-slate-700'>{copy.prompt}</p>
          <div className='flex flex-wrap gap-2'>
            <Button disabled={isPending} onClick={run} className={buttonClass}>
              {isPending ? copy.pending : copy.confirm}
            </Button>
            <Button
              variant='outline'
              disabled={isPending}
              onClick={() => setIsConfirming(false)}
              className='h-11 rounded-xl px-5'
            >
              Cancel
            </Button>
          </div>
        </>
      ) : (
        <Button
          onClick={() => {
            setNotice(null);
            setIsConfirming(true);
          }}
          className={buttonClass}
        >
          <Icon aria-hidden />
          {copy.start}
        </Button>
      )}
    </div>
  );
}

/** Why an account can't be promoted, in the order User Service checks. */
function promotionBlocker(user: User, actorId: string) {
  if (user.id === actorId) return 'This is your own account.';
  if (user.role === 'admin') {
    return `${user.display_name} is already an administrator.`;
  }
  return 'Only active accounts can be made administrators.';
}

function AdminRights({
  user,
  actorId,
  onChange,
}: {
  user: User;
  actorId: string;
  onChange: (user: User) => void;
}) {
  const [isConfirming, setIsConfirming] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(
    null,
  );
  const noticeBanner = notice && (
    <Notice tone={notice.ok ? 'info' : 'error'}>{notice.text}</Notice>
  );

  if (!canPromote(user, actorId)) {
    return (
      <div className='space-y-3'>
        {noticeBanner}
        <p className='text-sm text-slate-600'>
          {promotionBlocker(user, actorId)}
        </p>
      </div>
    );
  }

  function promote() {
    startTransition(async () => {
      const result = await promoteToAdmin(user.id).catch(() => null);
      setIsConfirming(false);
      if (result?.ok) {
        onChange(result.user);
        setNotice({
          ok: true,
          text: `${result.user.display_name} is now an administrator.`,
        });
      } else {
        setNotice({
          ok: false,
          text: result?.message ?? 'Something went wrong. Try again.',
        });
      }
    });
  }

  const buttonClass =
    'bg-courier hover:bg-courier/90 h-11 rounded-xl px-5 font-bold text-white';

  return (
    <div className='space-y-3'>
      {noticeBanner}
      {isConfirming ? (
        <>
          <p className='text-sm text-slate-700'>
            {user.display_name} will be able to suspend and reinstate users,
            cancel any order, and promote others. Another administrator can
            revoke this later.
          </p>
          <div className='flex flex-wrap gap-2'>
            <Button
              disabled={isPending}
              onClick={promote}
              className={buttonClass}
            >
              {isPending ? 'Promoting…' : 'Yes, make admin'}
            </Button>
            <Button
              variant='outline'
              disabled={isPending}
              onClick={() => setIsConfirming(false)}
              className='h-11 rounded-xl px-5'
            >
              Cancel
            </Button>
          </div>
        </>
      ) : (
        <Button
          onClick={() => {
            setNotice(null);
            setIsConfirming(true);
          }}
          className={buttonClass}
        >
          <ShieldPlus aria-hidden />
          Make admin
        </Button>
      )}
    </div>
  );
}

function CreditActivity({
  userId,
  credit,
  initialTransactions,
}: {
  userId: string;
  credit: CreditBalanceResult;
  initialTransactions: PageResult<CreditTransaction>;
}) {
  const history = usePagedList(initialTransactions, (window) =>
    loadUserTransactions(userId, window),
  );

  return (
    <div className='space-y-4'>
      {!credit.ok ? (
        <ErrorBanner>{credit.message}</ErrorBanner>
      ) : credit.balance ? (
        <dl className='grid grid-cols-3 gap-3'>
          {(
            [
              ['Available', credit.balance.available_balance],
              ['Held', credit.balance.reserved_balance],
              ['Total', credit.balance.total_balance],
            ] as const
          ).map(([label, value]) => (
            <div key={label} className='rounded-xl border p-3'>
              <dt className='text-xs font-medium text-slate-500'>{label}</dt>
              <dd className='mt-0.5 text-lg font-bold text-slate-900'>
                {value} cr
              </dd>
            </div>
          ))}
        </dl>
      ) : (
        <p className='text-sm text-slate-600'>
          No credit account yet. This user has not posted or delivered an
          errand.
        </p>
      )}

      {history.error && <ErrorBanner>{history.error}</ErrorBanner>}
      <ul className='divide-y rounded-xl border'>
        {history.items.map((transaction) => {
          const change = formatCreditChange(transaction);
          return (
            <li
              key={transaction.id}
              className='flex items-start justify-between gap-3 px-4 py-3'
            >
              <div className='min-w-0'>
                <p className='text-sm font-semibold break-words text-slate-900'>
                  {describeTransaction(transaction)}
                </p>
                <p className='text-xs break-all text-slate-500'>
                  {transaction.transaction_type}
                  {transaction.outcome === 'REJECTED' && ' · rejected'}
                  {transaction.order_id && (
                    <>
                      {' · '}
                      <Link
                        href={`/admin/orders/${transaction.order_id}`}
                        className='text-courier font-medium hover:underline'
                      >
                        View order
                      </Link>
                    </>
                  )}
                </p>
                <p className='text-xs text-slate-400'>
                  {formatDateTime(transaction.created_at)}
                </p>
              </div>
              <span
                className={cn(
                  'shrink-0 text-sm font-bold whitespace-nowrap',
                  TONE_CLASSES[change.tone],
                )}
              >
                {change.text}
              </span>
            </li>
          );
        })}
        {!history.error && history.items.length === 0 && (
          <li className='px-4 py-8 text-center text-sm text-slate-500'>
            No credit activity.
          </li>
        )}
      </ul>
      {history.hasMore && (
        <LoadMoreButton
          onClick={history.loadMore}
          loading={history.isLoading}
        />
      )}
    </div>
  );
}

export function UserReview({
  initialUser,
  actorId,
  credit,
  initialTransactions,
}: {
  initialUser: User;
  actorId: string;
  credit: CreditBalanceResult;
  initialTransactions: PageResult<CreditTransaction>;
}) {
  const [user, setUser] = useState(initialUser);

  return (
    <PageContainer>
      <PageHeader
        title='Review account'
        actions={
          <Button variant='outline' asChild className='h-10 rounded-xl'>
            <Link href='/admin/users'>
              <ArrowLeft aria-hidden />
              All users
            </Link>
          </Button>
        }
      />

      <div className='mx-auto max-w-3xl space-y-4 px-4 pt-4 pb-6 md:px-0'>
        <section className='rounded-2xl border bg-white p-5 shadow-sm'>
          <div className='flex items-center gap-4'>
            <span className='bg-brand-tint text-brand-strong grid size-14 shrink-0 place-items-center rounded-full text-xl font-bold'>
              {user.display_name.charAt(0).toUpperCase()}
            </span>
            <div className='min-w-0 space-y-1'>
              <p className='truncate text-lg font-bold text-slate-900'>
                {user.display_name}
              </p>
              <UserBadges role={user.role} status={user.status} />
            </div>
          </div>
          <dl className='mt-5 grid gap-4 sm:grid-cols-2'>
            <Detail label='Student number' value={user.nus_student_number} />
            <Detail label='Email' value={user.email} />
            <Detail label='Joined' value={formatDateTime(user.created_at)} />
            <Detail
              label='Last account change'
              value={formatDateTime(user.updated_at)}
            />
            <Detail label='User ID' value={user.id} />
          </dl>
        </section>

        <Section
          title='Account status'
          description='Suspension blocks login and ends every session immediately.'
        >
          <Moderation user={user} actorId={actorId} onChange={setUser} />
        </Section>

        <Section
          title='Administrator rights'
          description='Administrators manage users and orders from the admin view.'
        >
          <AdminRights user={user} actorId={actorId} onChange={setUser} />
        </Section>

        <Section
          title='Credit activity'
          description='Evidence for the review: reservations, settlements, refunds and admin adjustments, newest first.'
        >
          <CreditActivity
            userId={user.id}
            credit={credit}
            initialTransactions={initialTransactions}
          />
        </Section>
      </div>
    </PageContainer>
  );
}
