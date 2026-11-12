/*
 * AI Assistance Disclosure
 * Tool and date: OpenAI Codex (gpt-5.6-sol), 2026-10-03
 * Scope (AI-02): Adjusted existing UI styling to match the supplied Figma mockup.
 * Usage log: AI_USAGE_LOG.md
 * Author review: Changes validated and confirmed.
 * AI Assistance Disclosure:
 * Tool: OpenAI Codex (GPT-5), date: 2026-11-09
 * Scope: Implementation and test assistance for frontend chat integration.
 */
import { Outlet } from 'react-router'
import { CreditProvider } from '../../features/credits/CreditProvider'
import { NotificationProvider } from '../../features/notifications/NotificationProvider'
import { ChatNotificationBanners } from '../../features/notifications/ChatNotificationBanners'
import { AppHeader } from './AppHeader'
import { MobileBottomNav } from './MobileBottomNav'
import { Sidebar } from './Sidebar'

export function AppLayout() {
  return (
    <NotificationProvider>
      <CreditProvider>
        <div className="min-h-screen bg-[#f5f7f4] text-[#17211d]">
          <ChatNotificationBanners />
          <AppHeader />
          <div className="lg:grid lg:grid-cols-[236px_1fr]">
            <Sidebar />
            <main className="min-w-0 px-4 py-5 pb-24 sm:px-6 lg:px-9 lg:py-[34px] lg:pb-12">
              <Outlet />
            </main>
          </div>
          <MobileBottomNav />
        </div>
      </CreditProvider>
    </NotificationProvider>
  )
}
