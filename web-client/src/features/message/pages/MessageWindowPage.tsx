import { useParams } from 'react-router'
import { SYSTEM_SENDER_ID } from '@/api/message/message'
import { useName } from '@/api/user/member'
import { useCurrentUser } from '@/api/user/session'
import { ErrorState } from '@/components/ErrorState'
import { LoadingState } from '@/components/LoadingState'
import { Page } from '@/components/Page'
import { BackToMessages } from '../components/BackToMessages'
import { MessageComposer } from '../components/MessageComposer'
import { MessageList } from '../components/MessageList'
import { useChat } from '../useChat'

export function MessageWindowPage() {
  const { id = '' } = useParams()
  const user = useCurrentUser()
  // Relay is not an account: there is no name to look up and nobody to answer.
  const isSystem = id === SYSTEM_SENDER_ID
  const name = useName(id, !isSystem)
  const { history, messages, addSent } = useChat(id)
  const orderId = messages.findLast((m) => m.orderId)?.orderId

  return (
    <Page title={isSystem ? 'Relay' : (name.data ?? 'Conversation')}>
      <BackToMessages />

      {history.data === undefined ? (
        history.isError ? (
          <ErrorState error={history.error} onRetry={() => history.refetch()} />
        ) : (
          <LoadingState label="Loading messages" />
        )
      ) : (
        <MessageList
          messages={messages}
          ownId={user.id}
          hasEarlier={history.hasNextPage}
          loadingEarlier={history.isFetchingNextPage}
          onLoadEarlier={() => history.fetchNextPage()}
          reserveComposerSpace={!isSystem}
        />
      )}

      {!isSystem && <MessageComposer receiverId={id} orderId={orderId} onSent={addSent} />}
    </Page>
  )
}
