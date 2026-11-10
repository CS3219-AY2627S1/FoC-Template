// AI-assisted (Claude Opus 5.5): chat client state, ported from the standalone
// chat demo. Reviewed by authors.
import type { ChatConversation, ChatMessage, MessageKind } from "./types";

export interface PendingMessage {
  client_msg_id: string;
  conversation_id: string;
  kind: Exclude<MessageKind, "system">;
  body: string | null;
  payload: Record<string, unknown> | null;
  reply_to_id: string | null;
  created_at: string;
  /** sending = in flight; queued = will retry (offline/timeout); failed = rejected by server */
  status: "sending" | "queued" | "failed";
  error?: string;
  lastAttempt: number;
}

export interface ConvState {
  conv: ChatConversation;
  /** Window of messages we hold, keyed by seq. */
  messages: Record<number, ChatMessage>;
  /** true once the latest page was fetched (conversation opened at least once). */
  loaded: boolean;
  hasOlder: boolean;
  /** Every message with seq <= syncedSeq has reached this device (drives `delivered`). */
  syncedSeq: number;
}

export type ConnectionStatus = "connecting" | "syncing" | "live" | "offline";

export interface ChatState {
  meId: string;
  status: ConnectionStatus;
  convs: Record<string, ConvState>;
  pending: Record<string, PendingMessage>;
  /** conversation_id -> user_id -> expiry (ms epoch) */
  typing: Record<string, Record<string, number>>;
}

type Listener = () => void;

/** Minimal external store for useSyncExternalStore. Updates must be immutable. */
export class Store<S> {
  private listeners = new Set<Listener>();

  constructor(private state: S) {}

  get = (): S => this.state;

  set(update: (s: S) => S): void {
    const next = update(this.state);
    if (next !== this.state) {
      this.state = next;
      this.listeners.forEach((l) => l());
    }
  }

  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };
}

// ---- pure helpers

export function withConv(s: ChatState, id: string, fn: (c: ConvState) => ConvState): ChatState {
  const current = s.convs[id];
  if (!current) return s;
  const next = fn(current);
  return next === current ? s : { ...s, convs: { ...s.convs, [id]: next } };
}

/** Highest seq reachable from `from` without a hole in `messages`. */
export function contiguousFrom(
  from: number,
  messages: Record<number, ChatMessage>,
  lastSeq: number,
): number {
  let seq = from;
  while (seq < lastSeq && messages[seq + 1]) seq += 1;
  return seq;
}

export function sortedMessages(c: ConvState): ChatMessage[] {
  return Object.values(c.messages).sort((a, b) => a.seq - b.seq);
}

export function conversationOrder(convs: Record<string, ConvState>): ConvState[] {
  const ts = (c: ConvState) => c.conv.last_message_at ?? c.conv.created_at;
  return Object.values(convs).sort((a, b) => ts(b).localeCompare(ts(a)));
}

export function totalUnread(convs: Record<string, ConvState>): number {
  return Object.values(convs).reduce((n, c) => n + (c.conv.me?.unread_count ?? 0), 0);
}

/** Receipt state of my message `seq`, from the OTHER active members' positions. */
export function tickState(c: ConvState, meId: string, seq: number): "sent" | "delivered" | "read" {
  const others = c.conv.members.filter((m) => m.user_id !== meId);
  if (others.length === 0) return "sent";
  if (others.every((m) => m.read_seq >= seq)) return "read";
  if (others.every((m) => m.delivered_seq >= seq)) return "delivered";
  return "sent";
}
