// AI-assisted (Claude), reviewed and tested by Maliha
// AI-assisted (Claude Opus 5.5), 2026-11-12: "closes in an hour" notice after completion; see ui/ai-usage/usage-log.md, entry 003
import { useEffect, useRef, useState } from "react"
import { CHAT_ERRORS } from "../api/chat"
import { useChat } from "../hooks/useChat"

const time = (iso: string) =>
  new Date(iso).toLocaleTimeString("en-SG", { hour: "numeric", minute: "2-digit" })

// Requester <-> courier chat, shown on an accepted errand
export default function ChatPanel({ orderId, status }: { orderId: string; status?: string }) {
  const { messages, me, other, canSend, closesAt, error, loading, send } = useChat(orderId, status)
  const [text, setText]       = useState("")
  const [sending, setSending] = useState(false)
  const [notice, setNotice]   = useState("")
  const bottom = useRef<HTMLDivElement>(null)

  // keep the newest message in view
  useEffect(() => {
    bottom.current?.scrollIntoView({ block: "nearest" })
  }, [messages.length])

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    const body = text.trim()
    if (!body || sending) return
    setSending(true)
    setNotice("")
    const result = await send(body)
    setSending(false)
    if (result.error) {
      setNotice(CHAT_ERRORS[result.error])
      // keep the text on a temporary failure so it can be resent
      if (result.error === "blocked") setText("")
      return
    }
    setText("")
    if (result.masked) setNotice("Some words were hidden, and the message was reported to admins.")
  }

  // "Seen" goes under my last message once the other person has read it
  const lastMine = [...messages].reverse().find((m) => m.senderId === me)

  // Not my chat / not started yet / closed before anything loaded: just a note
  if (error && error !== "unavailable" && messages.length === 0) {
    return (
      <div className="bg-[#F7F9F8] border border-[#E4E8E6] rounded-xl px-4 py-3 mb-4 text-center">
        <p className="text-xs text-[#3F6B5A]">{CHAT_ERRORS[error]}</p>
      </div>
    )
  }

  return (
    <div className="bg-white border border-[#E4E8E6] rounded-xl mb-4 overflow-hidden">
      <div className="px-4 py-3 border-b border-[#E4E8E6] flex items-center justify-between">
        <h3 className="text-xs font-semibold text-[#162A46] uppercase tracking-wider">
          Chat{other && <span className="normal-case tracking-normal font-medium text-[#3F6B5A]"> with {other}</span>}
        </h3>
        {!loading && !canSend && !error && <span className="text-[10px] text-[#9CA3AF]">Read only</span>}
      </div>

      {/* errand finished: warn both people the chat is about to go */}
      {closesAt && canSend && (
        <p role="status" className="px-4 py-2 bg-amber-50 border-b border-amber-100 text-[11px] text-amber-800">
          Errand complete. This chat closes in an hour, at {time(closesAt)}, and the messages will be deleted.
        </p>
      )}

      <div className="h-64 overflow-y-auto px-4 py-3 space-y-2 bg-[#F7F9F8]">
        {loading ? (
          <p className="text-xs text-[#3F6B5A] text-center pt-24">Loading chat…</p>
        ) : messages.length === 0 ? (
          <p className="text-xs text-[#9CA3AF] text-center pt-24">
            {error ? CHAT_ERRORS[error] : "No messages yet. Say hi!"}
          </p>
        ) : messages.map((m) => {
          const mine = m.senderId === me
          return (
            <div key={m.id} className={`flex flex-col ${mine ? "items-end" : "items-start"}`}>
              <div className={`max-w-[80%] px-3 py-2 rounded-2xl text-sm leading-snug break-words ${
                mine ? "bg-[#1A4A36] text-white rounded-br-sm" : "bg-white border border-[#E4E8E6] text-[#1B2522] rounded-bl-sm"
              }`}>
                {m.body}
              </div>
              <span className="text-[10px] text-[#9CA3AF] mt-0.5 px-1">
                {time(m.sentAt)}
                {m.id === lastMine?.id && (m.readAt ? " · Seen" : " · Sent")}
              </span>
            </div>
          )
        })}
        <div ref={bottom} />
      </div>

      {notice && <p className="px-4 pt-2 text-[11px] text-amber-700">{notice}</p>}
      {error === "unavailable" && messages.length > 0 && (
        <p className="px-4 pt-2 text-[11px] text-red-600">{CHAT_ERRORS.unavailable}</p>
      )}

      {canSend ? (
        <form onSubmit={submit} className="flex gap-2 p-3">
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            maxLength={1000}
            placeholder="Type a message"
            className="flex-1 min-w-0 px-3.5 py-2 border border-[#E4E8E6] rounded-lg text-sm text-[#1B2522] focus:outline-none focus:border-[#1A4A36] focus:ring-1 focus:ring-[#1A4A36]"
          />
          <button
            type="submit"
            disabled={sending || !text.trim()}
            className="px-4 py-2 bg-[#1A4A36] text-white text-sm font-medium rounded-lg hover:bg-[#163D2C] disabled:opacity-50 transition-colors"
          >
            Send
          </button>
        </form>
      ) : !loading && !error && (
        <p className="px-4 py-3 text-[11px] text-[#9CA3AF] text-center">This chat has closed. You can no longer send messages.</p>
      )}
    </div>
  )
}