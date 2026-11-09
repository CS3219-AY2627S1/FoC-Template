// AI-assisted (Claude Opus 5.5): shapes returned by chat-service, mirroring
// chat-service/app/services/serialize.py and its WebSocket frames. Reviewed by authors.

export type MessageKind = "text" | "image" | "file" | "location" | "system";

export interface ChatMessage {
  id: string;
  conversation_id: string;
  seq: number;
  sender_id: string | null;
  client_msg_id: string | null;
  kind: MessageKind;
  body: string | null;
  payload: Record<string, unknown> | null;
  reply_to_id: string | null;
  created_at: string;
  edited_at: string | null;
  deleted_at: string | null;
}

export interface ChatMember {
  user_id: string;
  /** Role in this conversation, set by the service that created it (e.g. "courier"). */
  label: string | null;
  history_from_seq: number;
  delivered_seq: number;
  read_seq: number;
  joined_at: string;
}

export interface MyMembership {
  history_from_seq: number;
  delivered_seq: number;
  read_seq: number;
  unread_count: number;
}

export interface ChatConversation {
  id: string;
  kind: "direct" | "group";
  unique_key: string | null;
  title: string | null;
  metadata: Record<string, unknown>;
  last_seq: number;
  last_message_at: string | null;
  closed_at: string | null;
  purge_after: string | null;
  created_at: string;
  members: ChatMember[];
  // Only on user-scoped views (inbox, conversation.added, GET /conversations/:id).
  me?: MyMembership;
  last_message?: ChatMessage | null;
}

export interface ChatHistoryPage {
  messages: ChatMessage[];
  has_more: boolean;
}

/** An uploaded photo (POST /api/chat/conversations/:id/attachments). */
export interface ChatAttachment {
  attachment_id: string;
  content_type: string;
  size: number;
  width: number;
  height: number;
}

/** Payload of an image message, as stored by chat-service. */
export interface ImagePayload {
  attachment_id: string;
  mime?: string;
  size?: number;
  width?: number;
  height?: number;
}

export interface WsTicket {
  ticket: string;
  expires_at: string;
  expires_in: number;
}

// ---- WebSocket frames (server -> client)

export type ServerFrame =
  | { type: "ready"; data: { user_id: string; connection_id: string; server_time: string } }
  | { type: "ack"; req_id: string | null; data: Record<string, unknown> }
  | { type: "error"; req_id: string | null; data: { code: string; message: string } }
  | { type: "pong"; req_id: string | null }
  | { type: "message.new"; data: { message: ChatMessage } }
  | { type: "message.updated"; data: { message: ChatMessage } }
  | {
      type: "receipt";
      data: { conversation_id: string; user_id: string; delivered_seq: number; read_seq: number };
    }
  | { type: "typing"; data: { conversation_id: string; user_id: string } }
  | { type: "conversation.added"; data: { conversation: ChatConversation } }
  | { type: "conversation.updated"; data: { conversation: ChatConversation } }
  | { type: "conversation.removed"; data: { conversation_id: string } };

export type EventFrame = Exclude<ServerFrame, { type: "ready" | "ack" | "error" | "pong" }>;
