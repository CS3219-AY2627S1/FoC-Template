/*
 * AI Assistance Disclosure
 * Tool and date: OpenAI Codex (gpt-5.6-sol), 2026-10-03
 * Scope (AI-02): Adjusted existing UI styling to match the supplied Figma mockup.
 * Tool and date: OpenAI Codex (gpt-5.6-sol), 2026-10-17
 * Scope (AI-18): Built and tested the requested errand creation preview and entry points.
 * Usage log: AI_USAGE_LOG.md
 * Author review: Changes validated and confirmed.
 * AI Assistance Disclosure:
 * Tool: OpenAI Codex (GPT-5), date: 2026-11-10
 * Scope: Implementation, refactoring, and test assistance for the recorded frontend work.
 * AI Assistance Disclosure:
 * Tool: Anthropic Claude (model unrecorded), date: 2026-11-10
 * Scope (AI-62): Added the credit transaction history section
 * Author review: Code changes were checked and validated
 */

import type { ReactNode } from 'react'
import { NavLink } from 'react-router'
import clipboardIcon from '../../assets/nav-clipboard.svg'
import compassIcon from '../../assets/nav-compass.svg'
import chatIcon from '../../assets/nav-chat.svg'
import suppliersIcon from '../../assets/nav-suppliers.svg'

type MobileNavItemProps = {
  to: string
  end?: boolean
  icon?: string
  children: ReactNode
}

function MobileNavItem({
  to,
  end,
  icon,
  children,
}: MobileNavItemProps) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        [
          'flex min-w-0 flex-1 flex-col items-center gap-1 px-1 py-1',
          'text-center text-[10px] font-medium transition',
          isActive
            ? 'text-[#175c45]'
            : 'text-[#68736c] hover:text-[#17211d]',
        ].join(' ')
      }
    >
      {icon ? <img src={icon} alt="" width="17" height="17" /> : <span className="text-base leading-[17px]" aria-hidden="true">＋</span>}
      <span className="truncate">{children}</span>
    </NavLink>
  )
}

export function MobileBottomNav() {
  return (
    <nav
      aria-label="Mobile navigation"
      className="fixed inset-x-0 bottom-0 z-50 flex h-[68px] items-center justify-between border-t border-[#dde3de] bg-white px-[18px] py-2.5 lg:hidden"
    >
      <MobileNavItem to="/" end icon={compassIcon}>
        Browse
      </MobileNavItem>

      <MobileNavItem to="/my-errands" icon={clipboardIcon}>
        My errands
      </MobileNavItem>

      <MobileNavItem to="/chats" icon={chatIcon}>
        Chats
      </MobileNavItem>

      <MobileNavItem to="/assistant" icon={chatIcon}>
        Assistant
      </MobileNavItem>

      <MobileNavItem to="/suppliers" icon={suppliersIcon}>
        Suppliers
      </MobileNavItem>

      <MobileNavItem to="/credit-history" icon={clipboardIcon}>
        Credits
      </MobileNavItem>

      <MobileNavItem to="/errands/new">
        Create errand
      </MobileNavItem>
    </nav>
  )
}
