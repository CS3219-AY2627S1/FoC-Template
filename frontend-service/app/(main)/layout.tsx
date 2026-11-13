// AI Assistance Disclosure:
// Tool: Claude Code (model: claude-opus-5-5), date: 2026-11-11
// Scope: Writing implementation code — mount NotificationProvider and the mobile top bar in the user view only (ai-20261111-001).
// Author review: Not confirmed (pending).
// Details: frontend-service/ai/usage-log.md; ai-20261111-001

import { BottomNav, SideNav } from '@/components/app-nav';
import { CreditBalanceProvider } from '@/components/credit-balance-provider';
import { MobileTopBar } from '@/components/notifications/notification-bell';
import { NotificationProvider } from '@/components/notifications/notification-provider';
import { getCreditBalance } from '@/lib/credit-balance';
import { isAdminView, requireCurrentUser } from '@/lib/session';

export default async function MainLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // `proxy.ts` only checks that the cookie exists; this confirms with User
  // Service that the session is still valid before any private page renders.
  // The balance loads alongside; an invalid session redirects before it shows.
  const [, credit, adminView] = await Promise.all([
    requireCurrentUser(),
    getCreditBalance(),
    isAdminView(),
  ]);
  const view = adminView ? 'admin' : 'user';

  const shell = (
    <div className='bg-surface min-h-dvh md:pl-64'>
      <SideNav view={view} />
      {view === 'user' && <MobileTopBar />}
      <main className='pb-[calc(4rem+env(safe-area-inset-bottom))] md:pb-10'>
        {children}
      </main>
      <BottomNav view={view} />
    </div>
  );

  return (
    <CreditBalanceProvider initial={credit}>
      {/* Notifications are about the user's own errands, so the admin view
          neither shows them nor holds a stream open. */}
      {view === 'user' ? (
        <NotificationProvider>{shell}</NotificationProvider>
      ) : (
        shell
      )}
    </CreditBalanceProvider>
  );
}
