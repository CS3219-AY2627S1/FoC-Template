import { useEffect, useRef } from 'react'
import { useName } from '@/api/user/member'
import { useCurrentUser } from '@/api/user/session'
import { ErrorState } from '@/components/ErrorState'
import { LoadingState } from '@/components/LoadingState'
import type { ErrandChatProps } from '@/lib/errandChat'
import { useErrandChat } from '../useChat'
import { MessageComposer } from './MessageComposer'
import { MessageList } from './MessageList'

// The chat between the requester and the courier of one errand, shown on the errand page.
// The message-service decides who may read it and whether it still takes messages.
export function ErrandChat({ orderId, status, title }: ErrandChatProps) {
  const user = useCurrentUser()
  const { history, messages, addSent, otherId, open } = useErrandChat(orderId, status)
  const name = useName(otherId ?? '', otherId !== undefined)
  const sectionRef = useRef<HTMLElement>(null)
  const loaded = history.data !== undefined

  // "Chat" on an errand card links here with #chat. The router does not scroll to it by itself.
  useEffect(() => {
    if (loaded && window.location.hash === '#chat') sectionRef.current?.scrollIntoView({ block: 'start' })
  }, [loaded])

  return (
    <section
      ref={sectionRef}
      id="chat"
      className="ds-surface grid grid-cols-1 gap-4 p-5 lg:col-span-2"
      aria-labelledby="chat-title"
    >
      <div className="min-w-0">
        <h2 id="chat-title">{title}</h2>
        {name.data && <p className="text-sm text-muted wrap-anywhere">{name.data}</p>}
      </div>

      {!loaded ? (
        history.isError ? (
          <ErrorState error={history.error} onRetry={() => history.refetch()} />
        ) : (
          <LoadingState label="Loading chat" rows={2} />
        )
      ) : (
        <>
          <MessageList
            messages={messages}
            ownId={user.id}
            hasEarlier={history.hasNextPage}
            loadingEarlier={history.isFetchingNextPage}
            onLoadEarlier={() => history.fetchNextPage()}
            reserveComposerSpace={false}
            scroll="self"
            className="max-h-112"
          />
          {open && otherId ? (
            <MessageComposer receiverId={otherId} orderId={orderId} onSent={addSent} placement="inline" />
          ) : (
            <p className="text-sm text-muted">This chat is closed. Earlier messages stay here.</p>
          )}
        </>
      )}
    </section>
  )
}
