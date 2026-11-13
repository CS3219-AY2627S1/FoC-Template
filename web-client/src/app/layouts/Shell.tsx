import { Outlet } from 'react-router'
import type { ReactNode } from 'react'
import { Brand } from './Brand'

type ShellProps = {
  // Shown under the wordmark, e.g. "Student" or "Admin console".
  label: string
  // The navigation in the sidebar.
  nav: ReactNode
  // Below lg there is no sidebar. The navigation then sits either in a bar at the top of the
  // page, like the admin menu...
  mobileHeader?: ReactNode
  // ...or in a bar floating at the bottom of the screen, like the student tab bar.
  mobileTabBar?: ReactNode
  // Pinned to the bottom of the sidebar, e.g. the credit balance and log out.
  sidebarFooter?: ReactNode
}

// The frame shared by the student app and the admin console: a sidebar from lg (1024px) up,
// the page next to it. Below lg the sidebar is hidden and the mobile navigation takes over.
export function Shell({ label, nav, mobileHeader, mobileTabBar, sidebarFooter }: ShellProps) {
  return (
    <div className="min-h-dvh lg:flex">
      <aside className="ds-surface ds-surface--chrome hidden rounded-none border-y-0 border-l-0 lg:sticky lg:top-0 lg:flex lg:h-dvh lg:w-64 lg:shrink-0 lg:flex-col lg:gap-6 lg:p-4">
        <Brand label={label} />
        {nav}
        {sidebarFooter && <div className="mt-auto grid grid-cols-1 gap-3">{sidebarFooter}</div>}
      </aside>
      {mobileHeader && <div className="lg:hidden">{mobileHeader}</div>}
      {/* With a tab bar, the bottom padding keeps the last content above it on phones, and above the
          assistant button in the bottom right corner from lg, where the tab bar is gone. */}
      <main id="main" className={mobileTabBar ? 'min-w-0 flex-1 pb-28' : 'min-w-0 flex-1'}>
        <Outlet />
      </main>
      {mobileTabBar && <div className="fixed inset-x-4 bottom-4 z-20 mx-auto max-w-md lg:hidden">{mobileTabBar}</div>}
    </div>
  )
}
