import { useEffect, useRef, useState } from 'react'
import { Button } from '@base-ui/react/button'
import { Paperclip, SendHorizontal } from 'lucide-react'
import { lastWhere, useErrandChat, useViewing } from '../../hooks/useErrandChat'
import { orderErrorMessage } from '../../utils/orderErrors'
import { MAX_MESSAGE_LENGTH } from '../../types/errand.types'
import type { ChatAttachment, Errand } from '../../types/errand.types'
import styles from './ErrandChat.module.scss'

// a sending msg
type Outgoing = {
  id: string
  body: string | null
  file: File | null
  preview: string | null
  failed: boolean
  queuedAt: string
}

const IMAGE_TYPES = ['image/jpeg', 'image/png']
const VIDEO_TYPES = ['video/mp4', 'video/quicktime', 'video/webm']
const MB = 1024 * 1024
// A time label appears before the first message and after a quiet gap.
const GAP_MS = 5 * 60_000

const timeOnly = new Intl.DateTimeFormat('en-SG', {
  timeStyle: 'short',
  timeZone: 'Asia/Singapore',
})
const dayAndTime = new Intl.DateTimeFormat('en-SG', {
  day: 'numeric',
  month: 'short',
  hour: 'numeric',
  minute: '2-digit',
  timeZone: 'Asia/Singapore',
})
const sgDay = (time: Date) =>
  time.toLocaleDateString('en-SG', { timeZone: 'Asia/Singapore' })
export const timeLabel = (sentAt: string, now = new Date()) => {
  const time = new Date(sentAt)
  if (sgDay(time) === sgDay(now)) return timeOnly.format(time)
  const yesterday = new Date(now.getTime() - 24 * 60 * 60_000)
  if (sgDay(time) === sgDay(yesterday))
    return `Yesterday ${timeOnly.format(time)}`
  return dayAndTime.format(time)
}
const fileProblem = (file: File) => {
  if (IMAGE_TYPES.includes(file.type))
    return file.size > 5 * MB ? 'Photos can be up to 5 MB.' : null
  if (VIDEO_TYPES.includes(file.type))
    return file.size > 20 * MB ? 'Videos can be up to 20 MB.' : null
  return 'Send a JPEG or PNG photo, or an MP4, MOV or WebM video.'
}

const Media = ({ type, url }: { type: ChatAttachment['type']; url: string }) =>
  type === 'VIDEO' ? (
    <video
      className={styles.media}
      src={url}
      controls
      preload="metadata"
      aria-label="Video"
    />
  ) : (
    <a className={styles.mediaLink} href={url} target="_blank" rel="noreferrer">
      <img className={styles.media} src={url} alt="Photo" />
    </a>
  )

// Chat between the requester and the courier, open while the errand is in
// progress and read-only once the requester confirms receipt.
export const ErrandChat = ({ order }: { order: Errand }) => {
  // The message list, once shown; messages count as seen while it is in view.
  const [list, setList] = useState<HTMLOListElement | null>(null)
  const viewing = useViewing(list)
  const {
    chat,
    send,
    sendFile,
    userId,
    participant,
    readable,
    open,
    reconnecting,
  } = useErrandChat(order, viewing)
  const [text, setText] = useState('')
  const [outgoing, setOutgoing] = useState<Array<Outgoing>>([])
  const [problem, setProblem] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const confirmed = chat.data?.messages ?? []
  const sent = new Set(confirmed.map((message) => message.id))
  const waiting = outgoing.filter((message) => !sent.has(message.id))
  const count = confirmed.length + waiting.length

  // Keep the newest message in view.
  useEffect(() => {
    if (list) list.scrollTop = list.scrollHeight
  }, [list, count])
  // Free the device previews of photos and videos that have been sent.
  useEffect(() => {
    outgoing
      .filter((message) => message.preview && sent.has(message.id))
      .forEach((message) => URL.revokeObjectURL(message.preview!))
  })

  if (!order.courier || !readable) return null
  const isRequester = order.requester.id === userId
  const other = isRequester ? order.courier : order.requester
  const otherName =
    other.name ?? (isRequester ? 'your Courier' : 'the Requester')
  const nameOf = (senderId: string) =>
    senderId === order.requester.id
      ? (order.requester.name ?? 'Requester')
      : (order.courier?.name ?? 'Courier')

  // "Seen" goes under my latest message the other person has read.
  const otherRead = chat.data?.reads.find((read) => read.userId === other.id)
  const seenId =
    participant && otherRead
      ? lastWhere(
          confirmed,
          (message) =>
            message.senderId === userId &&
            Date.parse(message.sentAt) <= Date.parse(otherRead.lastReadAt),
        )?.id
      : undefined

  const update = (id: string, change: Partial<Outgoing>) =>
    setOutgoing((all) =>
      all.map((item) => (item.id === id ? { ...item, ...change } : item)),
    )
  const deliver = async (message: Outgoing) => {
    update(message.id, { failed: false })
    try {
      if (message.file)
        await sendFile.mutateAsync({ id: message.id, file: message.file })
      else await send.mutateAsync({ id: message.id, body: message.body! })
    } catch {
      // Kept with a Retry button; resending the same id cannot duplicate it.
      update(message.id, { failed: true })
    }
  }
  const queue = (message: Omit<Outgoing, 'failed' | 'queuedAt'>) => {
    const full = {
      ...message,
      failed: false,
      queuedAt: new Date().toISOString(),
    }
    setOutgoing((all) => [...all, full])
    void deliver(full)
  }
  const submit = () => {
    const body = text.trim()
    if (!body || body.length > MAX_MESSAGE_LENGTH) return
    setText('')
    queue({ id: crypto.randomUUID(), body, file: null, preview: null })
  }
  const attach = (files: Array<File>) => {
    const bad = files.map(fileProblem).find(Boolean)
    setProblem(bad ?? null)
    files
      .filter((file) => !fileProblem(file))
      .forEach((file) =>
        queue({
          id: crypto.randomUUID(),
          body: null,
          file,
          preview: URL.createObjectURL(file),
        }),
      )
  }

  // One list in time order, with a time label wherever a gap starts.
  const rows = [
    ...confirmed.map((message) => ({
      ...message,
      at: message.sentAt,
      pending: null,
    })),
    ...waiting.map((message) => ({
      id: message.id,
      senderId: userId!,
      body: message.body,
      attachment: message.file
        ? {
            type: message.file.type.startsWith('video/')
              ? ('VIDEO' as const)
              : ('IMAGE' as const),
            url: message.preview!,
          }
        : null,
      at: message.queuedAt,
      pending: message,
    })),
  ]

  return (
    <section className={styles.panel} aria-label="Chat">
      <h2>
        {participant
          ? `Chat with ${otherName}`
          : `Chat between ${nameOf(order.requester.id)} and ${nameOf(order.courier.id)}`}
      </h2>
      {reconnecting && (
        <p className={styles.notice} role="status">
          Reconnecting… new messages may take a moment to appear.
        </p>
      )}
      {chat.isError && !chat.data ? (
        <p role="alert" className={styles.note}>
          Messages could not be loaded.{' '}
          <button
            type="button"
            className={styles.link}
            onClick={() => void chat.refetch()}
          >
            Try again
          </button>
        </p>
      ) : chat.isPending ? (
        <p className={styles.note}>Loading messages…</p>
      ) : (
        <ol ref={setList} className={styles.messages} aria-label="Messages">
          {!count && (
            <li className={styles.empty}>
              {participant && open
                ? `No messages yet. Say hi to ${otherName}.`
                : 'No messages.'}
            </li>
          )}
          {rows.map((row, index) => {
            const previous = index > 0 ? rows[index - 1] : undefined
            const showTime =
              !previous ||
              Date.parse(row.at) - Date.parse(previous.at) >= GAP_MS
            const mine = row.senderId === userId
            const newSender =
              !previous || previous.senderId !== row.senderId || showTime
            return (
              <li key={row.id} className={styles.row}>
                {showTime && (
                  <time className={styles.separator} dateTime={row.at}>
                    {timeLabel(row.at)}
                  </time>
                )}
                <div
                  className={styles.message}
                  data-mine={mine}
                  data-failed={row.pending?.failed ?? false}
                >
                  {!mine && newSender && (
                    <span className={styles.sender}>
                      {nameOf(row.senderId)}
                    </span>
                  )}
                  {row.attachment && (
                    <Media
                      type={row.attachment.type}
                      url={row.attachment.url}
                    />
                  )}
                  {row.body && <p className={styles.bubble}>{row.body}</p>}
                  {row.pending ? (
                    row.pending.failed ? (
                      <span className={styles.status} role="alert">
                        Not sent.{' '}
                        <button
                          type="button"
                          className={styles.link}
                          onClick={() => void deliver(row.pending)}
                        >
                          Retry
                        </button>
                      </span>
                    ) : (
                      <span className={styles.status}>Sending…</span>
                    )
                  ) : (
                    row.id === seenId && (
                      <span className={styles.status}>Seen</span>
                    )
                  )}
                </div>
              </li>
            )
          })}
        </ol>
      )}

      {participant && open ? (
        <form
          className={styles.composer}
          onSubmit={(event) => {
            event.preventDefault()
            submit()
          }}
        >
          <button
            type="button"
            className={styles.attach}
            aria-label="Send a photo or video"
            onClick={() => fileRef.current?.click()}
          >
            <Paperclip size={18} aria-hidden="true" />
          </button>
          <input
            ref={fileRef}
            type="file"
            accept={[...IMAGE_TYPES, ...VIDEO_TYPES].join(',')}
            multiple
            hidden
            aria-label="Photo or video"
            onChange={(event) => {
              attach(Array.from(event.target.files ?? []))
              event.target.value = ''
            }}
          />
          <textarea
            aria-label="Message"
            placeholder={`Message ${otherName}`}
            rows={2}
            maxLength={MAX_MESSAGE_LENGTH}
            value={text}
            onChange={(event) => setText(event.target.value)}
            onKeyDown={(event) => {
              // Enter sends, Shift+Enter starts a new line.
              // Ignore Enter while an input method like pinyin is still composing
              if (
                event.key === 'Enter' &&
                !event.shiftKey &&
                !event.nativeEvent.isComposing
              ) {
                event.preventDefault()
                submit()
              }
            }}
          />
          <Button
            type="submit"
            className={styles.send}
            aria-label="Send message"
            disabled={!text.trim()}
          >
            <SendHorizontal size={18} aria-hidden="true" />
          </Button>
        </form>
      ) : (
        <p className={styles.note}>
          {participant
            ? 'Errand ended, this chat is closed for view only'
            : 'Read-only.'}
        </p>
      )}
      {problem && (
        <p role="alert" className={styles.error}>
          {problem}
        </p>
      )}
      {(send.error || sendFile.error) &&
        waiting.some((message) => message.failed) && (
          <p role="alert" className={styles.error}>
            {orderErrorMessage(sendFile.error ?? send.error)}
          </p>
        )}
    </section>
  )
}
