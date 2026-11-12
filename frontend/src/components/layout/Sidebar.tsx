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
 * Scope (AI-62): Added the credit transaction history section in the side bar
 * Author review: Code changes were checked and validated
 */
import type { ReactNode } from 'react'
import { NavLink } from 'react-router'
import clipboardIcon from '../../assets/nav-clipboard.svg'
import compassIcon from '../../assets/nav-compass.svg'
import chatIcon from '../../assets/nav-chat.svg'
import suppliersIcon from '../../assets/nav-suppliers.svg'

type SidebarNavItemProps = {
  to: string
  end?: boolean
  icon: string
  children: ReactNode
}

function SidebarNavItem({
  to,
  end,
  icon,
  children,
}: SidebarNavItemProps) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        [
          'flex h-11 items-center gap-3 rounded-xl px-3.5',
          'text-sm font-medium transition',
          isActive
            ? 'bg-[#ddf3e7] text-[#175c45]'
            : 'text-[#68736c] hover:bg-[#f5f7f4] hover:text-[#17211d]',
        ].join(' ')
      }
    >
      <img src={icon} alt="" width="19" height="19" />
      {children}
    </NavLink>
  )
}

export function Sidebar() {
  return (
    <aside className="hidden border-r border-[#dde3de] bg-white px-5 py-7 lg:sticky lg:top-[76px] lg:block lg:h-[calc(100vh-76px)] lg:self-start lg:overflow-y-auto">
      <nav
        aria-label="Primary navigation"
        className="space-y-2"
      >
        <SidebarNavItem to="/" end icon={compassIcon}>
          Browse errands
        </SidebarNavItem>

        <SidebarNavItem to="/my-errands" icon={clipboardIcon}>
          My errands
        </SidebarNavItem>

        <SidebarNavItem to="/chats" icon={chatIcon}>
          Chats
        </SidebarNavItem>

        <SidebarNavItem to="/assistant" icon={chatIcon}>
          Assistant
        </SidebarNavItem>

        <SidebarNavItem to="/suppliers" icon={suppliersIcon}>
          Suppliers
        </SidebarNavItem>

        <SidebarNavItem to="/credit-history" icon={clipboardIcon}>
          Credit transaction history
        </SidebarNavItem>
      </nav>

      <div className="mt-7 rounded-[18px] bg-[#0d3c2d] p-4 text-white">
        <p className="text-sm leading-5">Need something picked up on campus?</p>
        <NavLink
          to="/errands/new"
          className="mt-3 block rounded-lg bg-[#d8f06b] px-3 py-2.5 text-center text-sm font-semibold text-[#0d3c2d] transition hover:bg-[#cce85b]"
        >
          ＋ Create errand
        </NavLink>
      </div>
    </aside>
  )
}
