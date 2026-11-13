import { useCallback, useEffect, useRef, useState } from 'react'
import { CaseError, isUuid } from './cases'
import {
  chatFailure,
  chatMessage,
  chatRequest,
  currentConversation,
  mergeMessages,
  messagePage,
  type ChatMessage,
  type Conversation,
} from './conversations'
import { formatSingaporeTime } from './time'

type Pending = { clientMessageId: string; text: string }
type ThreadProps = {
  reference: Conversation
  actorId: string
  reviewerId: string | null
  writable: boolean
  participantView?: boolean
}
export function ConversationThread(props: ThreadProps) {
  const r = props.reference
  return (
    <Thread
      key={`${props.actorId}.${r.caseId}.${r.orderId}.${r.participantUserId}.${r.conversationId}`}
      {...props}
    />
  )
}
function Thread({
  reference,
  actorId,
  reviewerId,
  writable,
  participantView = false,
}: ThreadProps) {
  const storageKey = `foc.chat-pending.${actorId}.${reference.caseId}.${reference.conversationId}`
  const [pending, setPending] = useState<Pending | null>(() => {
    try {
      const value = JSON.parse(sessionStorage.getItem(storageKey) || 'null')
      return value &&
        typeof value.clientMessageId === 'string' &&
        isUuid(value.clientMessageId) &&
        typeof value.text === 'string' &&
        value.text.trim().length > 0 &&
        value.text.length <= 4000
        ? value
        : null
    } catch {
      return null
    }
  })
  const [text, setText] = useState(pending?.text || '')
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [readOnly, setReadOnly] = useState(true)
  const [next, setNext] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [sent, setSent] = useState(false)
  const [denied, setDenied] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const active = useRef(false)
  const inFlight = useRef(false)
  const controllers = useRef(new Set<AbortController>())
  const seenCursors = useRef(new Set<string>())
  const known = useRef<ChatMessage[]>([])
  const generation = useRef(Symbol())
  const permitted = !participantView || reference.participantUserId === actorId
  async function bounded<T>(work: (signal: AbortSignal) => Promise<T>) {
    const controller = new AbortController()
    controllers.current.add(controller)
    const timer = window.setTimeout(() => controller.abort(), 8000)
    try {
      return await work(controller.signal)
    } finally {
      clearTimeout(timer)
      controllers.current.delete(controller)
    }
  }
  const fail = useCallback((e: unknown) => {
    setError(chatFailure(e))
    setReadOnly(true)
    if (e instanceof CaseError && [401, 403, 404].includes(e.status)) {
      setDenied(true)
      setMessages([])
      known.current = []
      setNext(null)
    }
  }, [])
  useEffect(() => {
    active.current = true
    generation.current = Symbol()
    const requests = controllers.current
    let cancelled = false
    async function load() {
      if (!permitted) return
      inFlight.current = true
      setBusy(true)
      const controller = new AbortController()
      controllers.current.add(controller)
      const timer = window.setTimeout(() => controller.abort(), 8000)
      try {
        const current = await currentConversation(
          reference,
          actorId,
          controller.signal,
          participantView,
        )
        const page = messagePage(
          await chatRequest(
            `conversations/${reference.conversationId}/messages?limit=20&after=0`,
            controller.signal,
          ),
          reference.conversationId,
        )
        if (cancelled) return
        known.current = page.content
        seenCursors.current.clear()
        setMessages(page.content)
        setNext(page.nextCursor)
        setReadOnly(current.readOnly)
        setError('')
        setDenied(false)
      } catch (e) {
        if (!cancelled) fail(e)
      } finally {
        clearTimeout(timer)
        controllers.current.delete(controller)
        if (!cancelled) {
          inFlight.current = false
          setBusy(false)
        }
      }
    }
    void load()
    return () => {
      cancelled = true
      active.current = false
      requests.forEach((c) => c.abort())
    }
  }, [attempt, reference, actorId, participantView, permitted, fail])

  async function more() {
    if (inFlight.current || !next) return
    inFlight.current = true
    setBusy(true)
    setError('')
    const cursor = next
    const currentGeneration = generation.current
    try {
      const access = await bounded((signal) =>
        currentConversation(reference, actorId, signal, participantView),
      )
      if (!active.current || generation.current !== currentGeneration) return
      setReadOnly(access.readOnly)
      const page = messagePage(
        await bounded((signal) =>
          chatRequest(
            `conversations/${reference.conversationId}/messages?limit=20&after=${cursor}`,
            signal,
          ),
        ),
        reference.conversationId,
        Number(cursor),
      )
      if (!active.current || generation.current !== currentGeneration) return
      if (
        page.nextCursor &&
        (page.nextCursor === cursor || seenCursors.current.has(page.nextCursor))
      )
        throw new Error('Repeated cursor')
      const updated = mergeMessages(known.current, page.content)
      if (page.nextCursor && updated.length === known.current.length)
        throw new Error('No history progress')
      seenCursors.current.add(cursor)
      known.current = updated
      setMessages(updated)
      setNext(page.nextCursor)
    } catch (e) {
      if (active.current && generation.current === currentGeneration) fail(e)
    } finally {
      if (active.current && generation.current === currentGeneration) {
        inFlight.current = false
        setBusy(false)
      }
    }
  }
  async function send() {
    if (inFlight.current || readOnly || !writable || !permitted || !text.trim())
      return
    const operation = pending || {
      clientMessageId: crypto.randomUUID(),
      text: text.trim(),
    }
    try {
      sessionStorage.setItem(storageKey, JSON.stringify(operation))
    } catch {
      setError(
        'Nothing was sent. Allow this site to use browser storage, then try again.',
      )
      return
    }
    setPending(operation)
    setSent(false)
    setError('')
    inFlight.current = true
    setBusy(true)
    try {
      const current = await bounded((signal) =>
        currentConversation(reference, actorId, signal, participantView),
      )
      if (!active.current) return
      if (current.readOnly) throw new CaseError(409, 'Read only')
      const result = chatMessage(
        await bounded((signal) =>
          chatRequest(
            `conversations/${reference.conversationId}/messages`,
            signal,
            operation,
          ),
        ),
        reference.conversationId,
      )
      if (!active.current) return
      if (
        result.senderUserId !== actorId ||
        result.clientMessageId !== operation.clientMessageId ||
        result.text !== operation.text ||
        result.attachment !== null
      )
        throw new Error('Mismatched send result')
      // Delivery is acknowledged only by a validated server response, never optimistically.
      sessionStorage.removeItem(storageKey)
      setPending(null)
      setText('')
      setSent(true)
      setAttempt((n) => n + 1)
    } catch (e) {
      if (!active.current) return
      fail(e)
      if (e instanceof CaseError && e.status === 400) {
        sessionStorage.removeItem(storageKey)
        setPending(null)
      }
    } finally {
      if (active.current) {
        inFlight.current = false
        setBusy(false)
      }
    }
  }
  const canWrite = writable && !readOnly && permitted && !denied
  return (
    <section className="conversation-thread" aria-label="Private conversation">
      <div className="section-heading">
        <h3>
          {participantView
            ? 'Messages with your admin'
            : 'Private conversation'}
        </h3>
        <button
          className="button-secondary"
          disabled={busy || !permitted}
          onClick={() => {
            setSent(false)
            setAttempt((n) => n + 1)
          }}
        >
          Refresh conversation
        </button>
      </div>
      <p className="case-scope-note">
        {participantView
          ? 'Visible only to you and authorized admins.'
          : 'Only this participant and the admins can see this.'}
      </p>
      {!permitted ? (
        <p role="alert">You can’t see someone else’s conversation.</p>
      ) : (
        <>
          {error && (
            <p role="alert" className="workspace-error">
              {error}
            </p>
          )}
          {busy && <p role="status">Loading conversation…</p>}
          {sent && <p role="status">Message sent.</p>}
          {!denied && (
            <>
              <p className="role-chip">
                {canWrite
                  ? 'Replies enabled'
                  : !writable
                    ? 'Read-only'
                    : 'Replies temporarily unavailable'}
              </p>
              {messages.length ? (
                <ol className="conversation-messages">
                  {messages.map((message) => (
                    <li
                      key={message.id}
                      className={
                        message.senderUserId === actorId
                          ? 'conversation-own'
                          : ''
                      }
                    >
                      <strong>
                        {message.senderUserId === actorId
                          ? 'You'
                          : message.senderUserId === reference.participantUserId
                            ? 'Participant'
                            : message.senderUserId === reviewerId
                              ? participantView
                                ? 'Case admin'
                                : 'Assigned reviewer'
                              : 'Case admin'}
                      </strong>
                      <time dateTime={message.createdAt}>
                        {formatSingaporeTime(message.createdAt)}
                      </time>
                      {message.text !== null ? (
                        <p className="statement-text">{message.text}</p>
                      ) : (
                        <p>
                          Image attachment · {message.attachment?.mediaType}.
                          This image cannot be displayed here.
                        </p>
                      )}
                    </li>
                  ))}
                </ol>
              ) : (
                !busy &&
                !error && (
                  <p>
                    {!writable
                      ? 'No messages were exchanged.'
                      : 'No messages yet.'}
                  </p>
                )
              )}
              {next && (
                <button
                  className="button-secondary"
                  disabled={busy || !!error}
                  onClick={() => void more()}
                >
                  Load more messages
                </button>
              )}
              {!canWrite && (
                <p>
                  {!writable
                    ? 'You can read this conversation, but can’t reply.'
                    : 'We couldn’t check if you can reply. Refresh to try again.'}
                </p>
              )}
              {pending && (
                <p role="status">
                  We couldn’t confirm whether your message was sent. Refresh,
                  then retry the same message to avoid a duplicate.
                </p>
              )}
              {writable && (
                <form
                  className="case-form"
                  onSubmit={(e) => {
                    e.preventDefault()
                    void send()
                  }}
                >
                  <label htmlFor={`message-${reference.conversationId}`}>
                    Message
                  </label>
                  <textarea
                    id={`message-${reference.conversationId}`}
                    rows={4}
                    maxLength={4000}
                    value={text}
                    disabled={!canWrite || busy || !!pending}
                    onChange={(e) => setText(e.target.value)}
                  />
                  <small>
                    Up to 4,000 characters. Only text messages can be sent here.
                  </small>
                  <button disabled={!canWrite || busy || !text.trim()}>
                    {busy
                      ? pending
                        ? 'Sending…'
                        : 'Loading…'
                      : pending
                        ? 'Retry same message'
                        : 'Send message'}
                  </button>
                </form>
              )}
            </>
          )}
          {next && error && !denied && (
            <button
              className="button-secondary"
              disabled={busy}
              onClick={() => void more()}
            >
              Try loading more messages again
            </button>
          )}
        </>
      )}
    </section>
  )
}
