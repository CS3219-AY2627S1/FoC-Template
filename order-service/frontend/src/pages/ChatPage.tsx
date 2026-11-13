import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  ArrowLeft,
  Clock3,
  ImagePlus,
  Languages,
  MessageCircle,
  Send,
  ShieldCheck,
  X,
} from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import {
  fetchConversation,
  fetchImage,
  fetchMessages,
  fetchPreference,
  fetchQuickReplies,
  preserveTranslations,
  requestTranslationUntilSettled,
  savePreference,
  sendMessage,
  subscribeToChat,
  uploadImage,
  type ChatMessage,
} from '../api/chatApi'
import { readSession } from '../auth/session'

const languages = {
  en: 'English',
  zh: '中文',
  ms: 'Bahasa Melayu',
  ta: 'தமிழ்',
}

export function ChatPage() {
  const { orderId = '' } = useParams()
  const session = readSession()
  const client = useQueryClient()
  const [text, setText] = useState('')
  const [image, setImage] = useState<File | null>(null)

  const conversation = useQuery({
    queryKey: ['chat', orderId],
    queryFn: () => fetchConversation(orderId),
    retry: (n, e) => n < 5 && (e as { status?: number }).status === 404,
    retryDelay: 1000,
    refetchInterval: (query) => (query.state.data ? false : 2000),
  })

  const id = conversation.data?.id

  const messages = useQuery<ChatMessage[]>({
    queryKey: ['chat-messages', id],
    queryFn: () => fetchMessages(id!),
    enabled: !!id,
    refetchInterval: 5000,
    structuralSharing: (oldData, newData) =>
      preserveTranslations(
        oldData as ChatMessage[] | undefined,
        newData as ChatMessage[],
      ),
  })

  const quick = useQuery({
    queryKey: ['chat-quick'],
    queryFn: fetchQuickReplies,
  })

  const preference = useQuery({
    queryKey: ['chat-preference'],
    queryFn: fetchPreference,
  })

  const messageSnapshot = useRef(messages.data)
  useEffect(() => {
    messageSnapshot.current = messages.data
  }, [messages.data])

  useEffect(
    () =>
      id
        ? subscribeToChat(
            id,
            (message) =>
              client.setQueryData<ChatMessage[]>(
                ['chat-messages', id],
                (old) =>
                  old?.some((x) => x.id === message.id)
                    ? old
                    : [...(old ?? []), message],
              ),
            (event) =>
              client.setQueryData<ChatMessage[]>(['chat-messages', id], (old) =>
                old?.map((message) =>
                  message.id === event.translation.messageId
                    ? { ...message, translation: event.translation }
                    : message,
                ),
              ),
            () =>
              void client.invalidateQueries({
                queryKey: ['chat-messages', id],
              }),
          )
        : undefined,
    [id, client],
  )

  const targetLanguage = preference.data?.preferredLanguage
  const translationCandidateKey =
    messages.data
      ?.filter(
        (message) =>
          message.senderUserId !== session?.userId &&
          (message.messageType === 'TEXT' ||
            message.messageType === 'QUICK_REPLY') &&
          message.originalLanguage !== targetLanguage,
      )
      .map((message) => message.id)
      .join(',') ?? ''

  useEffect(() => {
    if (!id || !targetLanguage || !session?.userId) return
    const controller = new AbortController()
    const candidates =
      messageSnapshot.current?.filter(
        (message) =>
          message.senderUserId !== session.userId &&
          (message.messageType === 'TEXT' ||
            message.messageType === 'QUICK_REPLY') &&
          message.originalLanguage !== targetLanguage,
      ) ?? []

    candidates
      .filter(
        (message) =>
          message.translation?.targetLanguage !== targetLanguage ||
          message.translation.status === 'PENDING',
      )
      .forEach((message) => {
        void requestTranslationUntilSettled(id, message.id, targetLanguage, {
          signal: controller.signal,
          onUpdate: (translation) =>
            client.setQueryData<ChatMessage[]>(['chat-messages', id], (old) =>
              old?.map((item) =>
                item.id === message.id ? { ...item, translation } : item,
              ),
            ),
        }).catch((error) => {
          if ((error as Error).name !== 'AbortError') return undefined
        })
      })

    return () => controller.abort()
  }, [
    id,
    targetLanguage,
    session?.userId,
    client,
    translationCandidateKey,
  ])

  const mutation = useMutation({
    mutationFn: async (input: {
      type: 'TEXT' | 'QUICK_REPLY' | 'IMAGE'
      key?: string
    }) => {
      if (!id) throw new Error('Chat is not ready')
      if (input.type === 'IMAGE') {
        if (!image) throw new Error('Choose an image')
        const a = await uploadImage(id, image)
        return sendMessage(id, { messageType: 'IMAGE', attachmentId: a.id })
      }
      return sendMessage(id, {
        messageType: input.type,
        text: input.type === 'TEXT' ? text : undefined,
        quickReplyKey: input.key,
      })
    },
    onSuccess: (saved) => {
      client.setQueryData<ChatMessage[]>(['chat-messages', id], (old) =>
        old?.some((x) => x.id === saved.id) ? old : [...(old ?? []), saved],
      )
      setText('')
      setImage(null)
    },
  })

  if (conversation.isPending)
    return (
      <section className="card state-panel">
        <h1>Opening your chat…</h1>
        <p>This only takes a moment.</p>
      </section>
    )

  if (conversation.isError)
    return (
      <section className="card state-panel">
        <h1>Chat isn’t open yet</h1>
        <p>Chat opens once a courier accepts the errand.</p>
        <Link className="text-link" to={`/errands/${orderId}`}>
          Back to errand
        </Link>
      </section>
    )

  return (
    <section className="chat-page" aria-labelledby="chat-title">
      <Link className="text-link chat-back" to={`/errands/${orderId}`}>
        <ArrowLeft aria-hidden="true" />
        Errand details
      </Link>
      <header className="chat-heading">
        <div className="chat-title-group">
          <p className="eyebrow">Private errand conversation</p>
          <h1 id="chat-title">Errand chat</h1>
          <p>Coordinate the handoff without leaving your errand.</p>
        </div>
        <label className="language-select">
          <Languages aria-hidden="true" />
          <span>Language</span>
          <select
            aria-label="Preferred chat language"
            value={preference.data?.preferredLanguage ?? 'en'}
            onChange={(e) =>
              void savePreference(e.target.value).then(() => {
                if (id)
                  client.setQueryData<ChatMessage[]>(
                    ['chat-messages', id],
                    (old) =>
                      old?.map((message) => ({
                        ...message,
                        translation: null,
                      })),
                  )
                void client.invalidateQueries({ queryKey: ['chat-preference'] })
                void client.invalidateQueries({ queryKey: ['chat-quick'] })
              })
            }
          >
            {Object.entries(languages).map(([code, label]) => (
              <option key={code} value={code}>
                {label}
              </option>
            ))}
          </select>
          <small>
            Incoming messages are translated for you. You can always view the
            original.
          </small>
        </label>
      </header>
      <div className="chat-shell">
        <div className="chat-context">
          <span className="chat-context-icon" aria-hidden="true">
            <MessageCircle />
          </span>
          <div className="chat-context-copy">
            <strong>Errand conversation</strong>
            <span>
              <ShieldCheck aria-hidden="true" />
              Only this errand’s participants can read these messages.
            </span>
          </div>
          <span
            className={`chat-status ${conversation.data.readOnly ? 'chat-status-closed' : ''}`}
          >
            {conversation.data.readOnly ? 'Closed' : 'Active'}
          </span>
        </div>
        <div className="message-list" aria-live="polite">
          {messages.isPending ? (
            <p className="chat-loading">Loading messages…</p>
          ) : messages.data?.length ? (
            messages.data.map((message) => (
              <MessageBubble
                key={`${message.id}-${targetLanguage ?? 'original'}`}
                message={message}
                mine={message.senderUserId === session?.userId}
                preferredLanguage={targetLanguage}
              />
            ))
          ) : (
            <div className="chat-empty">
              <span aria-hidden="true">
                <MessageCircle />
              </span>
              <h2>Start the conversation</h2>
              <p>Share pickup details or tap a quick reply below.</p>
            </div>
          )}
        </div>
        {conversation.data.readOnly ? (
          <div className="notice chat-closed">
            This errand has ended, so the chat is closed. You can still read
            your messages.
          </div>
        ) : (
          <div className="chat-controls">
            <div className="quick-replies" aria-label="Quick replies">
              {quick.data?.content.map((q) => (
                <button
                  key={q.key}
                  disabled={mutation.isPending}
                  onClick={() =>
                    mutation.mutate({ type: 'QUICK_REPLY', key: q.key })
                  }
                  type="button"
                >
                  {q.text}
                </button>
              ))}
            </div>
            {image && (
              <div className="selected-image">
                <span>{image.name}</span>
                <button
                  aria-label="Remove selected image"
                  onClick={() => setImage(null)}
                  type="button"
                >
                  <X />
                </button>
              </div>
            )}
            <form
              className="chat-composer"
              onSubmit={(e) => {
                e.preventDefault()
                mutation.mutate({ type: image ? 'IMAGE' : 'TEXT' })
              }}
            >
              <label className="image-button" title="Add image">
                <ImagePlus aria-hidden="true" />
                <span className="sr-only">Add image</span>
                <input
                  accept="image/jpeg,image/png,image/webp"
                  onChange={(e) => setImage(e.target.files?.[0] ?? null)}
                  type="file"
                />
              </label>
              <textarea
                aria-label="Message"
                disabled={!!image || mutation.isPending}
                maxLength={4000}
                onChange={(e) => setText(e.target.value)}
                placeholder="Write a message…"
                rows={2}
                value={text}
              />
              <button
                aria-label="Send message"
                disabled={mutation.isPending || (!image && !text.trim())}
                type="submit"
              >
                <Send aria-hidden="true" />
              </button>
            </form>
            {mutation.isError && (
              <p className="notice notice-error" role="alert">
                {mutation.error.message}
              </p>
            )}
          </div>
        )}
      </div>
    </section>
  )
}

export function MessageBubble({
  message,
  mine,
  preferredLanguage,
}: {
  message: ChatMessage
  mine: boolean
  preferredLanguage?: string
}) {
  const [url, setUrl] = useState('')
  const [showOriginal, setShowOriginal] = useState(false)

  useEffect(() => {
    if (!message.attachment) return
    let current = ''
    void fetchImage(message.conversationId, message.attachment.id).then((v) => {
      current = v
      setUrl(v)
    })
    return () => {
      if (current) URL.revokeObjectURL(current)
    }
  }, [message])

  if (message.messageType === 'SYSTEM')
    return (
      <article className="system-message">
        <Clock3 aria-hidden="true" />
        <div>
          <p>{message.text}</p>
          <time dateTime={message.createdAt}>
            {new Date(message.createdAt).toLocaleString([], {
              dateStyle: 'medium',
              timeStyle: 'short',
            })}
          </time>
        </div>
      </article>
    )

  const translationApplies =
    !mine &&
    preferredLanguage !== message.originalLanguage &&
    message.translation?.targetLanguage === preferredLanguage
  const translated =
    translationApplies &&
    message.translation?.status === 'READY' &&
    message.translation.text

  return (
    <article className={`message-bubble ${mine ? 'message-mine' : ''}`}>
      {message.messageType === 'IMAGE' ? (
        url ? (
          <img alt={message.attachment?.filename ?? 'Shared image'} src={url} />
        ) : (
          <span>Loading image…</span>
        )
      ) : (
        <>
          {translated ? (
            <p>{message.translation?.text}</p>
          ) : (
            <p>{message.text}</p>
          )}
          {translated && (
            <button
              className="translation-toggle"
              onClick={() => setShowOriginal((value) => !value)}
              type="button"
            >
              {showOriginal ? 'Hide original' : 'View original'}
            </button>
          )}
          {translated && showOriginal && (
            <p className="message-original">{message.text}</p>
          )}
          {translationApplies && message.translation?.status === 'PENDING' && (
            <span className="translation-status">Translating…</span>
          )}
          {translationApplies && message.translation?.status === 'FAILED' && (
            <span className="translation-status">
              Translation unavailable · showing original
            </span>
          )}
        </>
      )}
      <time dateTime={message.createdAt}>
        {new Date(message.createdAt).toLocaleTimeString([], {
          hour: '2-digit',
          minute: '2-digit',
        })}
      </time>
    </article>
  )
}
