import { useEffect, useRef } from 'react'
import type { Message } from '@/api/message/types'
import { MessageField } from './MessageField'

type MessageListProps = {
  messages: Message[]
  ownId: string
  hasEarlier: boolean
  loadingEarlier: boolean
  onLoadEarlier: () => void
  // Keeps room at the bottom, so the last message is never hidden behind the composer.
  reserveComposerSpace: boolean
  // 'page': the list is part of the page and the page scrolls (the conversation page).
  // 'self': the list scrolls inside its own box (the errand page, the assistant overlay), so a new
  // message never moves the page around it. The box's height comes from className.
  scroll?: 'page' | 'self'
  className?: string
  emptyText?: string
}

export function MessageList({
  messages,
  ownId,
  hasEarlier,
  loadingEarlier,
  onLoadEarlier,
  reserveComposerSpace,
  scroll = 'page',
  className = '',
  emptyText = 'No messages yet. Say hello.',
}: MessageListProps) {
  const boxRef = useRef<HTMLDivElement>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const hasScrolled = useRef(false)
  const lastMessageId = messages.at(-1)?._id

  // Only a new last message scrolls down, so loading earlier messages keeps the reader's place.
  // Opening the chat jumps straight to the newest message; later messages glide in.
  useEffect(() => {
    const behavior = hasScrolled.current ? 'smooth' : 'instant'
    if (scroll === 'self') {
      boxRef.current?.scrollTo({ top: boxRef.current.scrollHeight, behavior })
    } else {
      bottomRef.current?.scrollIntoView({ behavior })
    }
    hasScrolled.current = true
  }, [lastMessageId, scroll])

  const layout = scroll === 'self' ? 'min-h-0 content-start overflow-y-auto' : reserveComposerSpace ? 'pb-40' : ''

  return (
    <div ref={boxRef} className={`grid grid-cols-1 gap-3 ${layout} ${className}`}>
      {hasEarlier && (
        <button
          type="button"
          className="ds-btn ds-btn--glass"
          aria-disabled={loadingEarlier}
          onClick={() => !loadingEarlier && onLoadEarlier()}
        >
          Load earlier messages
        </button>
      )}
      {messages.length === 0 && <p className="text-muted">{emptyText}</p>}
      {messages.map((m) => (
        <MessageField
          key={m._id}
          position={m.senderId === ownId ? 'right' : 'left'}
          content={m.content}
          timestamp={m.createdAt}
        />
      ))}
      <div ref={bottomRef} />
    </div>
  )
}
