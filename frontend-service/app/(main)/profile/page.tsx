import type { Metadata } from 'next';

import { ProfileView } from '@/components/profile/profile-view';
import { isAdminView, requireCurrentUser } from '@/lib/session';

export const metadata: Metadata = { title: 'Profile · Friend on Campus' };

export default async function ProfilePage() {
  const [user, adminView] = await Promise.all([
    requireCurrentUser(),
    isAdminView(),
  ]);
  return <ProfileView user={user} adminView={adminView} />;
}
