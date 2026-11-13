import { Link } from 'react-router'
import { useConversations } from '@/api/message/message'
import { EmptyState } from '@/components/EmptyState'
import { Page } from '@/components/Page'
import { QueryView } from '@/components/QueryView'
import { MessageCard } from '../components/MessageCard'

export function MessagePage() {
  const conversations = useConversations()

  return (
    <Page title="Messages" subtitle="Your chats with the people on your errands">
      <QueryView
        query={conversations}
        loadingLabel="Loading conversations"
        isEmpty={(items) => items.length === 0}
        empty={
          <EmptyState
            title="No conversations yet"
            action={
              <Link to="/errands" className="ds-btn ds-btn--glass">
                Browse errands
              </Link>
            }
          />
        }
      >
        {(items) => (
          <ul className="ds-surface ds-rows">
            {items.map((conversation) => (
              <MessageCard key={`${conversation.otherId}-${conversation.orderId ?? ''}`} conversation={conversation} />
            ))}
          </ul>
        )}
      </QueryView>
    </Page>
  )
}
