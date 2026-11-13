import { useMatch } from 'react-router'
import { BalanceCard } from '@/features/credit/components/BalanceCard'
import { RagChat } from '@/features/message/components/RagChat'
import { RagButton } from '@/features/rag/components/RagButton'
import { LogoutButton } from '@/features/user/components/LogoutButton'
import { appNav } from '../navigation'
import { Shell } from './Shell'
import { SideNav } from './SideNav'
import { TabBar } from './TabBar'

export function AppShell() {
  // A conversation pins its composer to the bottom of the screen, where the button would cover Send.
  const inConversation = useMatch('/message/:id') !== null

  return (
    <>
      <Shell
        label="Student"
        nav={<SideNav label="Main" items={appNav} />}
        mobileTabBar={<TabBar label="Main" items={appNav} />}
        sidebarFooter={
          <>
            <BalanceCard />
            <LogoutButton look="nav" />
          </>
        }
      />
      {/* Hidden, not unmounted, so the assistant conversation survives a visit to a conversation. */}
      <div hidden={inConversation}>
        <RagButton>
          <RagChat />
        </RagButton>
      </div>
    </>
  )
}
