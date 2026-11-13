'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Lock, LogOut, Mail, ShieldCheck, UserRound } from 'lucide-react';

import { Notice } from '@/components/auth/auth-layout';
import { FormField } from '@/components/auth/form-field';
import { PageContainer, PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import {
  type ActionResult,
  deactivateAccount,
  logout,
  updateProfile,
} from '@/lib/auth-actions';
import { switchView } from '@/lib/admin-actions';
import type { FieldErrors, User, UserUpdate } from '@/lib/user-service';
import { validateDisplayName, validatePassword } from '@/lib/validation';

const MEMBER_SINCE = new Intl.DateTimeFormat('en-SG', {
  month: 'long',
  year: 'numeric',
});

const FAILED: ActionResult = {
  ok: false,
  error: 'Something went wrong. Try again.',
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

/** Submits a change through `updateProfile` and tracks its outcome. */
function useProfileUpdate() {
  const [isPending, startTransition] = useTransition();
  const [result, setResult] = useState<ActionResult | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});

  function submit(changes: UserUpdate, localErrors: FieldErrors = {}) {
    setResult(null);
    setFieldErrors(localErrors);
    if (Object.values(localErrors).some(Boolean)) {
      return Promise.resolve(null);
    }

    return new Promise<ActionResult>((resolve) =>
      startTransition(async () => {
        const next = await updateProfile(changes).catch(() => FAILED);
        setResult(next);
        if (!next.ok) setFieldErrors(next.fieldErrors ?? {});
        resolve(next);
      }),
    );
  }

  return { submit, isPending, result, fieldErrors };
}

function DetailsForm({ user }: { user: User }) {
  const [displayName, setDisplayName] = useState(user.display_name);
  const [email, setEmail] = useState(user.email);
  const { submit, isPending, result, fieldErrors } = useProfileUpdate();

  const changes: UserUpdate = {
    ...(displayName.trim() !== user.display_name && {
      display_name: displayName.trim(),
    }),
    ...(email.trim().toLowerCase() !== user.email && { email: email.trim() }),
  };
  const isDirty = Object.keys(changes).length > 0;

  return (
    <form
      noValidate
      className='space-y-4'
      onSubmit={(e) => {
        e.preventDefault();
        submit(changes, {
          display_name:
            'display_name' in changes
              ? validateDisplayName(displayName)
              : undefined,
        });
      }}
    >
      <FormField
        id='display_name'
        label='Display name'
        icon={UserRound}
        autoComplete='name'
        maxLength={100}
        value={displayName}
        error={fieldErrors.display_name}
        onChange={(e) => setDisplayName(e.target.value)}
      />
      <FormField
        id='email'
        label='Email'
        icon={Mail}
        type='email'
        autoComplete='email'
        value={email}
        error={fieldErrors.email}
        onChange={(e) => setEmail(e.target.value)}
      />
      {result && (
        <Notice tone={result.ok ? 'info' : 'error'}>
          {result.ok ? 'Profile updated.' : result.error}
        </Notice>
      )}
      <Button
        type='submit'
        disabled={!isDirty || isPending}
        className='bg-brand hover:bg-brand-strong h-11 rounded-xl px-5 font-bold text-white'
      >
        {isPending ? 'Saving…' : 'Save changes'}
      </Button>
    </form>
  );
}

function PasswordForm() {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const { submit, isPending, result, fieldErrors } = useProfileUpdate();

  return (
    <form
      noValidate
      className='space-y-4'
      onSubmit={async (e) => {
        e.preventDefault();
        const result = await submit(
          { password },
          {
            password: validatePassword(password),
            confirm_password:
              confirmPassword === password
                ? undefined
                : 'Passwords do not match.',
          },
        );
        if (result?.ok) {
          setPassword('');
          setConfirmPassword('');
        }
      }}
    >
      <FormField
        id='new_password'
        label='New password'
        icon={Lock}
        type='password'
        autoComplete='new-password'
        value={password}
        error={fieldErrors.password}
        hint='8+ characters with a letter, a number and a special character.'
        onChange={(e) => setPassword(e.target.value)}
      />
      <FormField
        id='confirm_password'
        label='Confirm new password'
        icon={Lock}
        type='password'
        autoComplete='new-password'
        value={confirmPassword}
        error={fieldErrors.confirm_password}
        onChange={(e) => setConfirmPassword(e.target.value)}
      />
      {result && (
        <Notice tone={result.ok ? 'info' : 'error'}>
          {result.ok
            ? 'Password changed. Other devices have been logged out.'
            : result.error}
        </Notice>
      )}
      <Button
        type='submit'
        disabled={!password || isPending}
        className='bg-brand hover:bg-brand-strong h-11 rounded-xl px-5 font-bold text-white'
      >
        {isPending ? 'Updating…' : 'Change password'}
      </Button>
    </form>
  );
}

function DeactivateAccount() {
  const [isConfirming, setIsConfirming] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (!isConfirming) {
    return (
      <Button
        variant='outline'
        onClick={() => setIsConfirming(true)}
        className='h-11 rounded-xl border-red-200 px-5 font-semibold text-red-600 hover:bg-red-50 hover:text-red-700'
      >
        Deactivate account
      </Button>
    );
  }

  return (
    <div className='space-y-3'>
      <p className='text-sm text-slate-700'>
        You will be logged out everywhere and won&apos;t be able to log in
        again. Only an administrator can restore the account.
      </p>
      {error && <Notice tone='error'>{error}</Notice>}
      <div className='flex flex-wrap gap-2'>
        <Button
          disabled={isPending}
          onClick={() =>
            startTransition(async () => {
              // On success the action redirects to the login page.
              const result = await deactivateAccount().catch(() => FAILED);
              if (!result.ok) setError(result.error);
            })
          }
          className='h-11 rounded-xl bg-red-600 px-5 font-bold text-white hover:bg-red-700'
        >
          {isPending ? 'Deactivating…' : 'Yes, deactivate'}
        </Button>
        <Button
          variant='outline'
          disabled={isPending}
          onClick={() => {
            setIsConfirming(false);
            setError(null);
          }}
          className='h-11 rounded-xl px-5'
        >
          Cancel
        </Button>
      </div>
    </div>
  );
}

function AdminViewToggle({ adminView }: { adminView: boolean }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div className='space-y-3'>
      {error && <Notice tone='error'>{error}</Notice>}
      <Button
        variant='outline'
        disabled={isPending}
        onClick={() =>
          startTransition(async () => {
            setError(null);
            try {
              const { href } = await switchView(adminView ? 'user' : 'admin');
              // Inside the transition, so the button stays pending until the
              // chosen view's home page has loaded.
              router.push(href);
            } catch {
              setError('Something went wrong. Try again.');
            }
          })
        }
        className='text-courier hover:text-courier h-11 rounded-xl border-white bg-white px-5 font-bold hover:bg-white/90'
      >
        <ShieldCheck aria-hidden />
        {isPending
          ? 'Switching…'
          : adminView
            ? 'Switch to user view'
            : 'Switch to admin view'}
      </Button>
    </div>
  );
}

export function ProfileView({
  user,
  adminView,
}: {
  user: User;
  adminView: boolean;
}) {
  const [isLoggingOut, startLogout] = useTransition();

  return (
    <PageContainer>
      <PageHeader
        title='Profile'
        actions={
          <Button
            variant='outline'
            disabled={isLoggingOut}
            onClick={() => startLogout(() => logout())}
            className='h-10 rounded-xl'
          >
            <LogOut aria-hidden />
            {isLoggingOut ? 'Logging out…' : 'Log out'}
          </Button>
        }
      />

      <div className='mx-auto max-w-2xl space-y-4 px-4 pt-4 pb-6 md:px-0'>
        <section className='flex items-center gap-4 rounded-2xl border bg-white p-5 shadow-sm'>
          <span className='bg-brand-tint text-brand-strong grid size-14 shrink-0 place-items-center rounded-full text-xl font-bold'>
            {user.display_name.charAt(0).toUpperCase()}
          </span>
          <div className='min-w-0'>
            <p className='flex items-center gap-2 truncate text-lg font-bold text-slate-900'>
              {user.display_name}
              {user.role === 'admin' && (
                <span className='bg-courier-soft text-courier rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase'>
                  Admin
                </span>
              )}
            </p>
            <p className='text-sm text-slate-500'>
              {user.nus_student_number} · Member since{' '}
              {MEMBER_SINCE.format(new Date(user.created_at))}
            </p>
          </div>
        </section>

        {user.role === 'admin' && (
          <section className='bg-courier rounded-2xl p-5 text-white shadow-sm'>
            <h2 className='flex items-center gap-2 text-base font-bold'>
              <ShieldCheck className='size-5' aria-hidden />
              Admin view
              {adminView && (
                <span className='rounded-full bg-white/20 px-2 py-0.5 text-[10px] font-semibold uppercase'>
                  On
                </span>
              )}
            </h2>
            <p className='mt-1 text-sm text-white/80'>
              {adminView
                ? 'You are managing the platform. Switch back to request and deliver errands.'
                : 'Review accounts and suspend or reinstate users.'}
            </p>
            <div className='mt-4'>
              <AdminViewToggle adminView={adminView} />
            </div>
          </section>
        )}

        <Section title='Account details'>
          <DetailsForm user={user} />
        </Section>

        <Section
          title='Password'
          description='Changing your password logs you out on every other device.'
        >
          <PasswordForm />
        </Section>

        <Section
          title='Deactivate account'
          description='Hide your account and stop receiving errands. Your profile is kept.'
        >
          <DeactivateAccount />
        </Section>
      </div>
    </PageContainer>
  );
}
