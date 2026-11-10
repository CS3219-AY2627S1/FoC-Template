import { requestJson } from "./client";

export type ChatPerson = { userId: string; displayName: string; username: string | null; accountStatus: "ACTIVE" | "DELETED" };
export type ChatMessage = { messageId: string; conversationId: string; senderUserId: string; clientMessageId: string; sequence: number; text: string; createdAt: string };
export type Conversation = {
  conversationId: string; counterpart: ChatPerson; latestMessage: ChatMessage | null;
  createdAt: string; lastSequence: number; lastReadSequence: number; unreadCount: number;
  blocked: boolean; messagingAvailable: boolean;
};
export type ChatPage<T> = { items: T[]; nextCursor: string | null };
export type ChatHistory = { items: ChatMessage[]; boundarySequence: number; lastReadSequence: number; hasMore: boolean };
export type ReadState = { conversationId: string; lastReadSequence: number; unreadCount: number; boundarySequence: number };
export type BlockState = { userId: string; blockedByMe: boolean; messagingBlocked: boolean };

function query(values: Record<string, string | number | undefined>) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) if (value !== undefined) params.set(key, String(value));
  return params.toString();
}
const id = encodeURIComponent;
export const chatService = {
  search: (username: string, token: string, cursor?: string) => requestJson<ChatPage<{ userId: string; username: string }>>(`/chat/users?${query({ username, limit: 20, cursor })}`, {}, token),
  conversations: (token: string, cursor?: string) => requestJson<ChatPage<Conversation>>(`/chat/conversations?${query({ limit: 20, cursor })}`, {}, token),
  open: (recipientUserId: string, token: string) => requestJson<{ conversationId: string }>("/chat/conversations", { method: "POST", body: JSON.stringify({ recipientUserId }) }, token),
  conversation: (conversationId: string, token: string) => requestJson<Conversation>(`/chat/conversations/${id(conversationId)}`, {}, token),
  history: (conversationId: string, token: string, bounds: { beforeSequence?: number; afterSequence?: number } = {}) => requestJson<ChatHistory>(`/chat/conversations/${id(conversationId)}/messages?${query({ limit: 50, ...bounds })}`, {}, token),
  read: (conversationId: string, upToSequence: number, token: string) => requestJson<ReadState>(`/chat/conversations/${id(conversationId)}/read`, { method: "POST", body: JSON.stringify({ upToSequence }) }, token),
  blocks: (token: string, cursor?: string) => requestJson<ChatPage<ChatPerson>>(`/chat/blocks?${query({ limit: 50, cursor })}`, {}, token),
  block: (userId: string, enabled: boolean, token: string) => requestJson<BlockState>(`/chat/blocks/${id(userId)}`, { method: enabled ? "PUT" : "DELETE" }, token),
};

// Python str.strip() whitespace, including NEL/control separators but excluding BOM.
export function trimMessage(text: string): string {
  const whitespace = (character: string) => /\p{White_Space}/u.test(character) || (character.charCodeAt(0) >= 28 && character.charCodeAt(0) <= 31);
  let start = 0, end = text.length;
  while (start < end && whitespace(text[start])) start++;
  while (end > start && whitespace(text[end - 1])) end--;
  return text.slice(start, end);
}

export function messageValidation(text: string): string | null {
  if ([...text].length > 4096) return "Messages can contain at most 4,096 characters.";
  if (!trimMessage(text)) return "Write a message before sending.";
  for (const character of text) {
    const point = character.codePointAt(0)!;
    if (point === 0 || (point >= 0xd800 && point <= 0xdfff)) return "Remove unsupported characters before sending.";
  }
  return null;
}

export function mergeMessages(existing: ChatMessage[], incoming: ChatMessage[]): ChatMessage[] {
  const byId = new Map(existing.map((message) => [message.messageId, message]));
  for (const message of incoming) byId.set(message.messageId, message);
  return [...byId.values()].sort((a, b) => a.sequence - b.sequence);
}
