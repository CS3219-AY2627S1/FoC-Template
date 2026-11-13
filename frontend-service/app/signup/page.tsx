import type { Metadata } from 'next';

import { SignupForm } from '@/components/auth/signup-form';

export const metadata: Metadata = {
  title: 'Create an account · Friend on Campus',
};

export default function SignupPage() {
  return <SignupForm />;
}
