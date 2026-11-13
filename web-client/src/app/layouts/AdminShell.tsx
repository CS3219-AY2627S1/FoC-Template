import { ArrowLeftRight } from 'lucide-react'
import { Link } from 'react-router'
import { LogoutButton } from '@/features/user/components/LogoutButton'
import { adminNav } from '../navigation'
import { MobileMenu } from './MobileMenu'
import { Shell } from './Shell'
import { SideNav } from './SideNav'

const consoleLabel = 'Admin console'

export function AdminShell() {
  // Pinned to the bottom of the sidebar, and at the end of the mobile menu.
  const footer = (
    <div className="grid grid-cols-1 gap-1">
      <Link to="/" className="ds-nav-item w-full">
        <ArrowLeftRight aria-hidden="true" className="size-5 shrink-0" />
        <span className="min-w-0">Leave admin console</span>
      </Link>
      <LogoutButton look="nav" />
    </div>
  )

  return (
    <Shell
      label={consoleLabel}
      nav={<SideNav label="Admin" items={adminNav} />}
      mobileHeader={
        <MobileMenu label={consoleLabel}>
          <SideNav label="Admin" items={adminNav} />
          <hr className="ds-hairline" />
          {footer}
        </MobileMenu>
      }
      sidebarFooter={footer}
    />
  )
}
