//
// AI Assistance Disclosure
// Tool: Anthropic Claude (model unrecorded), date: 2026-11-10
// Scope (AI-64): Generated the AiErrandAssistant component for the frontend, including state management, form handling, and API integration for drafting errands. 
// Author review: Code changes were checked and validated

import { 
  useEffect, 
  useRef, 
  useState, 
  type KeyboardEvent, 
  type SubmitEvent } from 'react'
import {
  AI_DRAFT_MESSAGE_MAX_LENGTH,
  AI_DRAFT_MESSAGE_MIN_LENGTH,
  AiAssistantApiError,
  draftErrand,
  type AiErrandDraft,
} from '../../features/ai-assistant/ai-assistant.api'

type AiErrandAssistantProps = {
  onDraft: (draft: AiErrandDraft) => void
  disabled?: boolean
}

function SparkleIcon() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor" aria-hidden="true">
      <path d="M12 2l1.9 5.6L19.5 9.5l-5.6 1.9L12 17l-1.9-5.6L4.5 9.5l5.6-1.9L12 2zm7 11l.95 2.55L22.5 16.5l-2.55.95L19 20l-.95-2.55-2.55-.95 2.55-.95L19 13zM5 15l.7 1.8 1.8.7-1.8.7L5 20l-.7-1.8-1.8-.7 1.8-.7L5 15z" />
    </svg>
  )
}

function SendIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden="true">
      <path d="M3.4 20.4l17.45-7.48a1 1 0 000-1.84L3.4 3.6a1 1 0 00-1.39 1.17L4.2 12l-2.19 7.23a1 1 0 001.39 1.17zM5.9 13h6.6a1 1 0 000-2H5.9L4.6 6.7 18.1 12 4.6 17.3 5.9 13z" />
    </svg>
  )
}

export function AiErrandAssistant({ onDraft, disabled = false }: AiErrandAssistantProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [message, setMessage] = useState('')
  const [isSending, setIsSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const controllerRef = useRef<AbortController | null>(null)

  const trimmedMessage = message.trim()
  const canSend =
    !disabled && !isSending && trimmedMessage.length >= AI_DRAFT_MESSAGE_MIN_LENGTH

  useEffect(() => {
    if (isOpen) textareaRef.current?.focus()
  }, [isOpen])

  useEffect(() => () => controllerRef.current?.abort(), [])

  function close() {
    controllerRef.current?.abort()
    setIsOpen(false)
    setIsSending(false)
    setError(null)
  }

  async function send(event?: SubmitEvent<HTMLFormElement>) {
    event?.preventDefault()
    if (!canSend) {
      if (trimmedMessage.length < AI_DRAFT_MESSAGE_MIN_LENGTH) {
        setError(`Please describe your errand in at least ${AI_DRAFT_MESSAGE_MIN_LENGTH} characters.`)
      }
      return
    }

    const controller = new AbortController()
    controllerRef.current = controller
    setIsSending(true)
    setError(null)

    try {
      const draft = await draftErrand(trimmedMessage, controller.signal)
      if (controller.signal.aborted) return
      onDraft(draft)
      setMessage('')
      setIsOpen(false)
    } catch (caught) {
      if (controller.signal.aborted) return
      setError(
        caught instanceof AiAssistantApiError
          ? caught.message
          : 'The assistant could not draft this errand. Please try again.',
      )
    } finally {
      if (controllerRef.current === controller) controllerRef.current = null
      if (!controller.signal.aborted) setIsSending(false)
    }
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      void send()
    } else if (event.key === 'Escape') {
      close()
    }
  }

  const fabClassName =
    'flex h-14 w-14 shrink-0 cursor-pointer items-center justify-center rounded-full bg-[#0d3c2d] text-[#d8f06b] shadow-[0_10px_28px_rgba(13,60,45,0.35)] transition hover:bg-[#175c45] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#175c45] disabled:cursor-not-allowed disabled:bg-[#9aa79f] disabled:text-white'

  return (
    <div className="fixed bottom-[84px] right-4 z-40 flex max-w-[calc(100vw-2rem)] items-end justify-end lg:bottom-6 lg:right-6">
      {isOpen ? (
        <form
          onSubmit={(event) => void send(event)}
          className="flex w-[min(26rem,calc(100vw-2rem))] items-end gap-2.5"
          aria-label="AI errand assistant"
        >
          <div className="min-w-0 flex-1 rounded-[18px] border border-[#dde3de] bg-white p-3 shadow-[0_10px_28px_rgba(22,59,42,0.18)]">
            <div className="flex items-center justify-between gap-2">
              <label htmlFor="ai-errand-message" className="text-sm font-semibold text-[#17211d]">
                Describe your errand
              </label>
              <button
                type="button"
                onClick={close}
                aria-label="Close AI assistant"
                className="cursor-pointer rounded-md px-1.5 text-lg leading-none text-[#68736c] transition hover:bg-[#f5f7f4] hover:text-[#17211d]"
              >
                ×
              </button>
            </div>
            <textarea
              ref={textareaRef}
              id="ai-errand-message"
              value={message}
              onChange={(event) => {
                setMessage(event.target.value)
                setError(null)
              }}
              onKeyDown={handleKeyDown}
              maxLength={AI_DRAFT_MESSAGE_MAX_LENGTH}
              rows={3}
              disabled={isSending}
              placeholder="e.g. Get iced milo from Deck to COM3 level 2 by 5pm"
              aria-invalid={Boolean(error)}
              aria-describedby={error ? 'ai-errand-error' : 'ai-errand-hint'}
              className="mt-2 w-full resize-none rounded-xl border border-[#dde3de] bg-white px-3 py-2.5 text-sm leading-5 text-[#17211d] outline-none transition placeholder:text-[#929c95] focus:border-[#175c45] focus:ring-4 focus:ring-[#175c45]/10 disabled:bg-[#f8faf8]"
            />
            {error ? (
              <p id="ai-errand-error" className="mt-1.5 text-xs text-red-700" role="alert">
                {error}
              </p>
            ) : (
              <p id="ai-errand-hint" className="mt-1.5 text-xs text-[#68736c]" aria-live="polite">
                {isSending
                  ? 'Drafting your errand…'
                  : 'Press Enter to send. The form will be filled in for you to review.'}
              </p>
            )}
          </div>

          <button
            type="submit"
            disabled={!canSend}
            aria-label={isSending ? 'Drafting errand' : 'Send to AI assistant'}
            className={fabClassName}
          >
            {isSending ? (
              <span className="h-5 w-5 animate-spin rounded-full border-2 border-current border-t-transparent" aria-hidden="true" />
            ) : (
              <SendIcon />
            )}
          </button>
        </form>
      ) : (
        <button
          type="button"
          onClick={() => setIsOpen(true)}
          disabled={disabled}
          aria-label="Draft errand with AI assistant"
          title="Draft errand with AI"
          className={fabClassName}
        >
          <SparkleIcon />
        </button>
      )}
    </div>
  )
}
