// AI Assistance Disclosure: ChatGPT (Codex, GPT-6), 2026-11-12.
// Scope: Stable chat ordering and post-completion courier access.
// Human review pending; see ui/ai-usage/chat-bug-fixes.md.
// AI-assisted (Claude), reviewed and tested by Maliha
// AI-assisted (Claude Opus 5.5), 2026-11-12: re-join on status change, close at closesAt; see ui/ai-usage/usage-log.md, entry 003
import { useEffect, useRef, useState } from "react"
import {
  ask, getChatSocket, mergeChatMessages,
  type ChatErrorCode, type ChatMessage, type JoinReply, type SendReply,
} from "../api/chat"

// Live chat for one errand: history, new messages, read receipts.
// chat-service decides who's allowed in and whether sending is still open.
// status is the order's status: when it changes (e.g. delivered) we re-join
// so chat-service can tell us when the chat closes.
export function useChat(orderId: string, status?: string) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [me, setMe]             = useState("")
  const [other, setOther]       = useState<string | null>(null)
  const [canSend, setCanSend]   = useState(false)
  const [closesAt, setClosesAt] = useState<string | null>(null)
  const [error, setError]       = useState<ChatErrorCode | null>(null)
  const [loading, setLoading]   = useState(true)

  const session = useRef({ active: false })
  const lastOrder = useRef(orderId)

  useEffect(() => {
    const current = { active: true }
    session.current = current
    let joinVersion = 0
    setLoading(true)
    setCanSend(false)
    setError(null)
    if (lastOrder.current !== orderId) {
      setMessages([])
      setMe("")
      setOther(null)
      setClosesAt(null)
      lastOrder.current = orderId
    }
    const socket = getChatSocket()
    let myId = ""

    const join = async () => {
      const version = ++joinVersion
      const reply = await ask<JoinReply>("chat:join", { orderId })
      if (!current.active || version !== joinVersion) return
      setLoading(false)
      if ("error" in reply) {
        setError(reply.error)
        setCanSend(false)
        return
      }
      myId = reply.me
      setError(null)
      setMe(reply.me)
      setOther(reply.other)
      setCanSend(reply.canSend)
      setClosesAt(reply.closesAt)
      setMessages(previous => mergeChatMessages(previous, reply.messages))
    }

    const onMessage = (m: ChatMessage) => {
      if (!current.active || m.orderId !== orderId) return
      // my own message also arrives here, after the send reply added it
      setMessages(prev => mergeChatMessages(prev, [m]))
      // it's on screen, so it's read
      if (m.senderId !== myId) ask("chat:read", { orderId })
    }

    // the other person has seen everything I sent so far
    const onRead = (r: { orderId: string; readerId: string }) => {
      if (!current.active || r.orderId !== orderId || r.readerId === myId) return
      const now = new Date().toISOString()
      setMessages((prev) => prev.map((m) => (m.senderId === myId && !m.readAt ? { ...m, readAt: now } : m)))
    }

    // chat-service down: say so. Socket.IO keeps retrying and "connect" re-joins
    const onConnectError = (err: Error) => {
      if (!current.active || err.message === "unauthorized") return
      setLoading(false)
      setError("unavailable")
    }

    socket.on("chat:message", onMessage)
    socket.on("chat:read", onRead)
    // also re-joins after a reconnect, which picks up anything missed
    socket.on("connect", join)
    socket.on("connect_error", onConnectError)
    if (socket.connected) join()

    return () => {
      current.active = false
      socket.off("chat:message", onMessage)
      socket.off("chat:read", onRead)
      socket.off("connect", join)
      socket.off("connect_error", onConnectError)
      socket.emit("chat:leave", { orderId })
    }
  }, [orderId, status])

  // close on screen at the closing time, without waiting for the next send
  useEffect(() => {
    if (!closesAt) return
    // messages are deleted at this point too, so drop them and show the closed note
    const close = () => { session.current.active = false; setCanSend(false); setMessages([]); setError("closed") }
    const left = new Date(closesAt).getTime() - Date.now()
    if (left <= 0) { close(); return }
    const timer = window.setTimeout(close, left)
    return () => window.clearTimeout(timer)
  }, [closesAt])

  // resolves to an error code, or null once it's sent
  const send = async (text: string): Promise<{ error: ChatErrorCode | null; masked: boolean }> => {
    const current = session.current
    const reply = await ask<SendReply>("chat:send", { orderId, text })
    if (!current.active) return { error: "closed", masked: false }
    if ("error" in reply) {
      if (reply.error === "closed") setCanSend(false)
      return { error: reply.error, masked: false }
    }
    setMessages(prev => mergeChatMessages(prev, [reply.message]))
    return { error: null, masked: reply.masked }
  }

  return { messages, me, other, canSend, closesAt, error, loading, send }
}