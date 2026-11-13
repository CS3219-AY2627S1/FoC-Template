'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { IdCard, Lock, Mail, UserRound } from 'lucide-react';

import { AuthLayout } from '@/components/auth/auth-layout';
import { FormField } from '@/components/auth/form-field';
import { Button } from '@/components/ui/button';
import { type ActionResult, signup } from '@/lib/auth-actions';
import type { FieldErrors } from '@/lib/user-service';
import {
  validateDisplayName,
  validatePassword,
  validateStudentNumber,
} from '@/lib/validation';

const EMPTY_FORM = {
  nus_student_number: '',
  email: '',
  display_name: '',
  password: '',
  confirm_password: '',
};

type SignupFields = typeof EMPTY_FORM;

function validate(form: SignupFields): FieldErrors {
  return {
    nus_student_number: validateStudentNumber(form.nus_student_number),
    display_name: validateDisplayName(form.display_name),
    password: validatePassword(form.password),
    confirm_password:
      form.confirm_password === form.password
        ? undefined
        : 'Passwords do not match.',
  };
}

export function SignupForm() {
  const router = useRouter();
  const [form, setForm] = useState(EMPTY_FORM);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  function field(name: keyof SignupFields) {
    return {
      id: name,
      value: form[name],
      error: fieldErrors[name],
      onChange: (e: React.ChangeEvent<HTMLInputElement>) =>
        setForm((current) => ({ ...current, [name]: e.target.value })),
    };
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const errors = validate(form);
    setFieldErrors(errors);
    if (Object.values(errors).some(Boolean)) return;

    setIsSubmitting(true);
    let result: ActionResult;
    try {
      result = await signup({
        nus_student_number: form.nus_student_number.trim(),
        email: form.email.trim(),
        display_name: form.display_name.trim(),
        password: form.password,
      });
    } catch {
      result = { ok: false, error: 'Something went wrong. Try again.' };
    }
    setIsSubmitting(false);

    if (!result.ok) {
      setError(result.error);
      setFieldErrors(result.fieldErrors ?? {});
      return;
    }
    router.push('/home');
    router.refresh();
  }

  return (
    <AuthLayout subtitle='Create your account'>
      <form onSubmit={handleSubmit} noValidate className='mt-8 space-y-4'>
        <FormField
          {...field('nus_student_number')}
          label='NUS student number'
          icon={IdCard}
          autoComplete='username'
          autoCapitalize='characters'
          required
          maxLength={9}
          placeholder='A1234567B'
        />
        <FormField
          {...field('email')}
          label='Email'
          icon={Mail}
          type='email'
          autoComplete='email'
          required
          placeholder='alex.tan@u.nus.edu'
        />
        <FormField
          {...field('display_name')}
          label='Display name'
          icon={UserRound}
          autoComplete='name'
          required
          maxLength={100}
          placeholder='Alex Tan'
          hint='Shown to other students on your errands.'
        />
        <FormField
          {...field('password')}
          label='Password'
          icon={Lock}
          type='password'
          autoComplete='new-password'
          required
          hint='8+ characters with a letter, a number and a special character.'
        />
        <FormField
          {...field('confirm_password')}
          label='Confirm password'
          icon={Lock}
          type='password'
          autoComplete='new-password'
          required
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
          {isSubmitting ? 'Creating account…' : 'Create Account'}
        </Button>
      </form>

      <p className='mt-6 text-center text-sm text-slate-500'>
        Already have an account?{' '}
        <Link
          href='/'
          className='text-brand-strong font-semibold hover:underline'
        >
          Log in
        </Link>
      </p>
    </AuthLayout>
  );
}
