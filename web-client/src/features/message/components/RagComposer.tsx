import { useState } from 'react'
import type { SubmitEvent } from 'react'
import { FormError } from '@/components/FormError'

type RagComposerProps = {
  pending: boolean
  error: unknown
  // Resolves false when the assistant could not answer, so the question goes back into the field.
  onAsk: (question: string) => Promise<boolean>
}

export function RagComposer({ pending, error, onAsk }: RagComposerProps) {
  const [text, setText] = useState('')

  async function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault()
    const question = text.trim()
    if (!question || pending) return

    setText('')
    const answered = await onAsk(question)
    if (!answered) setText(question)
  }

  return (
    <form noValidate onSubmit={handleSubmit} className="grid grid-cols-1 gap-2 border-t border-border p-2">
      <FormError error={error} />
      <div className="flex gap-2">
        <input
          className="ds-field min-w-0 flex-1"
          aria-label="Question for the assistant"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Ask the assistant"
        />
        <button type="submit" className="ds-btn ds-btn--primary" aria-disabled={pending}>
          {pending ? 'Asking…' : 'Send'}
        </button>
      </div>
    </form>
  )
}
