import { useState } from 'react'
import type { Message } from '@/api/message/types'
import { useAskAssistant } from '@/api/rag/prompt'
import type { AssistantTurn } from '@/api/rag/prompt'
import { useCurrentUser } from '@/api/user/session'
import { MessageList } from './MessageList'
import { RagComposer } from './RagComposer'

// The assistant is not an account; this id only tells its answers apart from the user's questions.
const ASSISTANT_ID = 'assistant'

function bubble(senderId: string, receiverId: string, content: string): Message {
  const now = new Date().toISOString()
  return { _id: crypto.randomUUID(), senderId, receiverId, content, status: 'read', createdAt: now, updatedAt: now }
}

function turnOf(message: Message): AssistantTurn {
  return { role: message.senderId === ASSISTANT_ID ? 'assistant' : 'user', content: message.content }
}

// The content of the assistant overlay: the conversation scrolls, the composer stays at the bottom.
// The conversation lives only here, so it lasts while the app is open and is gone after a reload.
export function RagChat() {
  const user = useCurrentUser()
  const ask = useAskAssistant()
  const [messages, setMessages] = useState<Message[]>([])

  async function onAsk(content: string) {
    const question = bubble(user.id, ASSISTANT_ID, content)
    const conversation = messages.map(turnOf)
    setMessages((prev) => [...prev, question])
    try {
      const answer = await ask.mutateAsync({ query: content, conversation })
      setMessages((prev) => [...prev, bubble(ASSISTANT_ID, user.id, answer.response)])
      return true
    } catch {
      // A question without an answer would leave two questions in a row, so it goes back to the field.
      setMessages((prev) => prev.filter((m) => m._id !== question._id))
      return false
    }
  }

  return (
    <>
      <MessageList
        messages={messages}
        ownId={user.id}
        hasEarlier={false}
        loadingEarlier={false}
        onLoadEarlier={() => {}}
        reserveComposerSpace={false}
        scroll="self"
        className="flex-1 p-4"
        emptyText="Ask how Relay works, for example how to post an errand or earn credits."
      />
      {ask.isPending && (
        <p role="status" className="animate-pulse px-4 pb-2 text-sm text-muted">
          The assistant is thinking…
        </p>
      )}
      <RagComposer pending={ask.isPending} error={ask.error} onAsk={onAsk} />
    </>
  )
}
