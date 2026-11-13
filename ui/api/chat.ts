// AI Assistance Disclosure: ChatGPT (Codex, GPT-6), 2026-11-12.
// Scope: Stable chat ordering and post-completion courier access.
// Human review pending; see ui/ai-usage/chat-bug-fixes.md.
// AI-assisted (Claude), reviewed and tested by Maliha
// AI-assisted (Claude Opus 5.5), 2026-11-12: closesAt in the join reply; see ui/ai-usage/usage-log.md, entry 003
// Additional use: (Claude Code, Claude Opus 5.5), 2026-11-12: WebSocket-only transport for multi-pod chat. See ai/usage-log.md, entry 009.
import { io, type Socket } from "socket.io-client"
import { api, refreshToken } from "./client"

export type ChatMessage = {
  id: string
  orderId: string
  senderId: string
  body: string
  sentAt: string
  readAt: string | null
}

export type ChatErrorCode = "invalid-input" | "forbidden" | "not-started" | "closed" | "blocked" | "unavailable"

export type JoinReply =
  | { messages: ChatMessage[]; canSend: boolean; closesAt: string | null; me: string; other: string | null }
  | { error: ChatErrorCode }

export type SendReply =
  | { message: ChatMessage; masked: boolean }
  | { error: ChatErrorCode }

export const CHAT_ERRORS: Record<ChatErrorCode, string> = {
  "invalid-input": "That message couldn't be sent.",
  "forbidden":     "This chat is only for the requester and courier.",
  "not-started":   "Chat opens once a courier accepts this request.",
  "closed":        "This chat closed 1 hour after the errand ended.",
  "blocked":       "Message not sent. It looks like it breaks the community rules, and has been reported to admins.",
  "unavailable":   "Chat isn't available right now. Try again in a bit.",
}

// One socket for the whole app; the chat panel joins rooms on it.
// The token is read on every (re)connect, so a refreshed one gets picked up.
let socket: Socket | null = null

export function getChatSocket() {
  if (socket) return socket
  socket = io({
    path: "/backend/chat/socket.io",
    // WebSocket only, no HTTP polling first: the whole connection then stays
    // on one chat pod, so several pods work without sticky sessions
    transports: ["websocket"],
    auth: (cb) => cb({ token: localStorage.getItem("token") }),
  })
  // access token expired: get a new one and try again
  socket.on("connect_error", async (err) => {
    if (err.message === "unauthorized" && (await refreshToken())) socket?.connect()
  })
  return socket
}

// on logout, so the next user doesn't reuse this connection
export function closeChatSocket() {
  socket?.close()
  socket = null
}

// emit with a reply, as a promise. Times out so a dead connection doesn't hang the UI
export function ask<T>(event: string, payload: object): Promise<T> {
  return getChatSocket()
    .timeout(8000)
    .emitWithAck(event, payload)
    .catch(() => ({ error: "unavailable" }) as T)
}

// ── Admin: flagged messages ──

export type Flag = {
  id: string
  orderId: string
  userId: string
  userName: string
  originalText: string
  action: "masked" | "blocked"
  flaggedAt: string
  reviewedAt: string | null
}

export const getFlags = (includeReviewed = false) =>
  api<{ flags: Flag[] }>(`/chat/flags${includeReviewed ? "?include=reviewed" : ""}`).then((r) => r.flags)

export const reviewFlag = (id: string) =>
  api<unknown>(`/chat/flags/${id}/review`, { method: "POST" })

// Combine history, socket events and acknowledgements without losing read receipts.
// sentAt is server-generated; numeric message IDs break timestamp ties.
export function mergeChatMessages(current: ChatMessage[], incoming: ChatMessage[]) {
  const messages = new Map(current.map(message => [message.id, message]))
  for (const message of incoming) {
    const previous = messages.get(message.id)
    messages.set(message.id, { ...message, readAt: message.readAt ?? previous?.readAt ?? null })
  }
  return [...messages.values()].sort((a, b) => {
    const time = Date.parse(a.sentAt) - Date.parse(b.sentAt)
    if (time) return time
    if (/^\d+$/.test(a.id) && /^\d+$/.test(b.id)) {
      const left = BigInt(a.id), right = BigInt(b.id)
      return left < right ? -1 : left > right ? 1 : 0
    }
    return a.id.localeCompare(b.id)
  })
}
