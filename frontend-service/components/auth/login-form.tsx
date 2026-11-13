'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { IdCard, Lock } from 'lucide-react';

import { AuthLayout, Notice } from '@/components/auth/auth-layout';
import { FormField } from '@/components/auth/form-field';
import { Button } from '@/components/ui/button';
import { type ActionResult, login } from '@/lib/auth-actions';
import { safeRedirectPath } from '@/lib/auth';

const NOTICES: Record<string, string> = {
  expired: 'Your session has ended. Log in again to continue.',
  deactivated:
    'Your account has been deactivated. Contact an administrator to restore it.',
};

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const noticeKey = searchParams.get('notice') ?? '';
  const notice = NOTICES[noticeKey];
  const [studentNumber, setStudentNumber] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function submit() {
    setError(null);
    setIsSubmitting(true);
    let result: ActionResult;
    try {
      result = await login({
        nus_student_number: studentNumber.trim(),
        password,
      });
    } catch {
      result = { ok: false, error: 'Something went wrong. Try again.' };
    }
    setIsSubmitting(false);

    if (!result.ok) {
      setError(result.error);
      return;
    }
    router.push(safeRedirectPath(searchParams.get('from')));
    router.refresh();
  }

  return (
    <AuthLayout subtitle='Campus errands, sorted by your peers'>
      {notice && (
        <div className='mt-8'>
          <Notice>{notice}</Notice>
        </div>
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
        className='mt-8 space-y-4'
      >
        <FormField
          id='nus_student_number'
          label='NUS student number'
          icon={IdCard}
          autoComplete='username'
          autoCapitalize='characters'
          required
          maxLength={9}
          placeholder='A1234567B'
          value={studentNumber}
          onChange={(e) => setStudentNumber(e.target.value)}
        />

        <FormField
          id='password'
          label='Password'
          icon={Lock}
          type='password'
          autoComplete='current-password'
          required
          placeholder='••••••••••'
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />

        {error && (
          <p role='alert' className='text-sm text-red-600'>
            {error}
          </p>
        )}

        <Button
          type='submit'
          disabled={isSubmitting}
          className='bg-brand hover:bg-brand-strong h-12 w-full rounded-xl text-base font-bold text-white'
        >
          {isSubmitting ? 'Logging in…' : 'Log In'}
        </Button>
      </form>

      <p className='mt-6 text-center text-sm text-slate-500'>
        New to FoC?{' '}
        <Link
          href='/signup'
          className='text-brand-strong font-semibold hover:underline'
        >
          Create an account
        </Link>
      </p>
    </AuthLayout>
  );
}
