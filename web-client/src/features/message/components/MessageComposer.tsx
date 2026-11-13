import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import type { SubmitEvent } from 'react'
import { messageKeys } from '@/api/message/message'
import type { Message, SocketError } from '@/api/message/types'
import { Notice } from '@/components/Notice'
import { useMessage } from '../messageContext'

const SEND_TIMEOUT_MS = 5000

type MessageComposerProps = {
  receiverId: string
  // Replies continue the chat of the newest errand. Without one there is nothing to reply on.
  orderId: string | undefined
  onSent: (message: Message) => void
  // 'fixed': pinned to the bottom of the screen (the conversation page). 'inline': part of the
  // surrounding box (the chat on the errand page).
  placement?: 'fixed' | 'inline'
}

export function MessageComposer({ receiverId, orderId, onSent, placement = 'fixed' }: MessageComposerProps) {
  const queryClient = useQueryClient()
  const { socket } = useMessage()
  const [text, setText] = useState('')
  const [error, setError] = useState<string | null>(null)

  function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault()
    const content = text
    if (!socket || !orderId || !content.trim()) return

    setError(null)
    setText('')
    // The server only emits to the receiver, so our own copy comes back through the ack.
    // On a refusal or no answer the text goes back into the field, so nothing typed is lost.
    socket
      .timeout(SEND_TIMEOUT_MS)
      .emit('sendMessage', { orderId, receiverId, content }, (err: Error | null, saved: Message | SocketError) => {
        if (err) {
          setText(content)
          setError('The message service did not answer. Try again.')
          return
        }
        if ('error' in saved) {
          setText(content)
          setError(saved.error.message)
          return
        }
        onSent(saved)
        void queryClient.invalidateQueries({ queryKey: messageKeys.conversations })
      })
  }

  const form = (
    <form
      noValidate
      onSubmit={handleSubmit}
      className={
        placement === 'fixed'
          ? 'mx-auto grid w-full max-w-layout grid-cols-1 gap-2 px-4 pb-4 md:px-8 lg:pb-6'
          : 'grid grid-cols-1 gap-2'
      }
    >
      {!socket && (
        <Notice tone="info" role="status" title="Connecting">
          Messages can be sent as soon as the connection is back.
        </Notice>
      )}
      {!orderId && (
        <Notice tone="info" role="status" title="No errand to reply on">
          Chats belong to an errand. Start one from an errand you share once a courier has accepted it.
        </Notice>
      )}
      {error && <Notice tone="danger" role="alert" title={error} />}
      <div className="ds-surface ds-surface--chrome flex gap-2 p-2">
        <input
          className="ds-field min-w-0 flex-1"
          aria-label="Message"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Type a message"
        />
        <button type="submit" className="ds-btn ds-btn--primary" aria-disabled={!socket || !orderId}>
          Send
        </button>
      </div>
    </form>
  )

  if (placement === 'inline') return form

  return (
    // Pinned to the bottom of the screen: above the floating tab bar on phones, and next to
    // the sidebar from lg, where the tab bar is gone. Same width and gutters as Page.
    <div className="fixed inset-x-0 bottom-24 z-10 lg:bottom-0 lg:left-64">{form}</div>
  )
}
