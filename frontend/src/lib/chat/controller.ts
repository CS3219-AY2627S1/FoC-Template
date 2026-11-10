// AI-assisted (Claude Opus 5.5): chat client controller, ported from the
// standalone chat demo (sync on reconnect, seq gap detection, receipts, typing,
// persistent send queue). Reviewed by authors.
import { chatApi, wsBaseUrl } from "../api";
import { ChatSocket, RequestError } from "./socket";
import {
  contiguousFrom,
  Store,
  withConv,
  type ChatState,
  type ConvState,
  type PendingMessage,
} from "./store";
import type { ChatConversation, ChatMessage, EventFrame } from "./types";

const PAGE = 50;
const TYPING_TTL_MS = 5_000;
const TYPING_THROTTLE_MS = 3_000;
const RETRY_EVERY_MS = 5_000;
const RETRYABLE = new Set(["timeout", "disconnected", "internal", "rate_limited"]);

async function ticketUrl(): Promise<string> {
  const { ticket } = await chatApi.ticket();
  return `${wsBaseUrl()}/api/chat/ws?ticket=${encodeURIComponent(ticket)}`;
}

/**
 * Glue between the socket, the HTTP API and the store. Implements the client half of the
 * protocol: buffered sync on (re)connect, gap detection by seq, receipts, typing, and a
 * persistent pending-send queue keyed by client_msg_id.
 */
export class ChatController {
  readonly store: Store<ChatState>;
  private socket: ChatSocket;
  private buffer: EventFrame[] | null = null; // non-null while syncing
  private activeId: string | null = null;
  private visible = true;
  private deliveredTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private deliveredWanted = new Map<string, number>();
  private readSent = new Map<string, number>();
  private lastTypingSent = new Map<string, number>();
  private gapFetches = new Set<string>();
  private timers: ReturnType<typeof setInterval>[] = [];
  private pendingKey: string;

  constructor(
    meId: string,
    private onAuthFailed: () => void,
    private onRemoved: (title: string) => void,
  ) {
    this.pendingKey = `foc.chat.pending.${meId}`;
    this.store = new Store<ChatState>({
      meId,
      status: "connecting",
      convs: {},
      pending: this.loadPending(),
      typing: {},
    });
    this.socket = new ChatSocket(ticketUrl, {
      onReady: () => void this.sync(),
      onEvent: (f) => (this.buffer ? this.buffer.push(f) : this.apply(f)),
      onStatus: (st) => {
        if (st !== "ready") this.set((s) => ({ ...s, status: st === "connecting" ? "connecting" : "offline" }));
      },
      onAuthFailed: () => this.onAuthFailed(),
    });
  }

  start(): void {
    this.socket.start();
    this.timers.push(setInterval(() => this.expireTyping(), 1_000));
    this.timers.push(setInterval(() => this.retryQueued(), RETRY_EVERY_MS));
  }

  stop(): void {
    this.socket.stop();
    this.timers.forEach(clearInterval);
    this.deliveredTimers.forEach(clearTimeout);
  }

  private set(update: (s: ChatState) => ChatState) {
    this.store.set(update);
  }

  private get state() {
    return this.store.get();
  }

  // ------------------------------------------------------------------ sync

  /** On every (re)connect: buffer live events, reload the inbox, catch up, replay. */
  private async sync(): Promise<void> {
    this.buffer = [];
    this.set((s) => ({ ...s, status: "syncing" }));
    try {
      const inbox = await chatApi.inbox();
      const previous = this.state.convs;
      const convs: Record<string, ConvState> = {};
      for (const conv of inbox) {
        const prev = previous[conv.id];
        convs[conv.id] = prev
          ? { ...prev, conv }
          : { conv, messages: {}, loaded: false, hasOlder: false, syncedSeq: conv.last_seq };
        if (conv.last_message) convs[conv.id].messages = { ...convs[conv.id].messages, [conv.last_message.seq]: conv.last_message };
      }
      for (const id of Object.keys(previous)) {
        if (!convs[id]) this.onRemoved(this.titleOf(previous[id].conv));
      }
      this.set((s) => ({ ...s, convs }));

      // Opened conversations: fetch what we missed while offline. Others: the inbox is enough.
      await Promise.all(
        Object.values(convs)
          .filter((c) => c.loaded && c.syncedSeq < c.conv.last_seq)
          .map((c) => this.fillGap(c.conv.id)),
      );
      for (const c of Object.values(this.state.convs)) {
        if (!c.loaded) this.set((s) => withConv(s, c.conv.id, (x) => ({ ...x, syncedSeq: Math.max(x.syncedSeq, x.conv.last_seq) })));
        this.queueDelivered(c.conv.id);
      }
      if (this.activeId && this.state.convs[this.activeId] && !this.state.convs[this.activeId].loaded) {
        await this.loadLatest(this.activeId);
      }
    } catch (err) {
      console.error("sync failed", err);
    } finally {
      const buffered = this.buffer ?? [];
      this.buffer = null;
      buffered.forEach((f) => this.apply(f));
      this.set((s) => ({ ...s, status: this.socket.isReady ? "live" : "offline" }));
      this.markReadIfActive();
      this.flushPending();
    }
  }

  private async fillGap(id: string): Promise<void> {
    if (this.gapFetches.has(id)) return;
    this.gapFetches.add(id);
    try {
      for (let page = 0; page < 20; page++) {
        const c = this.state.convs[id];
        if (!c) return;
        const res = await chatApi.history(id, { after_seq: c.syncedSeq, limit: 100 });
        this.mergeMessages(id, res.messages);
        if (!res.has_more) break;
      }
      this.set((s) =>
        withConv(s, id, (c) => {
          // Messages before history_from_seq never arrive; don't wait for them.
          const floor = Math.max(c.syncedSeq, c.conv.me?.history_from_seq ?? 0);
          return { ...c, syncedSeq: contiguousFrom(floor, c.messages, c.conv.last_seq) };
        }),
      );
      this.queueDelivered(id);
    } catch (err) {
      console.error("gap fill failed", err);
    } finally {
      this.gapFetches.delete(id);
    }
  }

  private mergeMessages(id: string, messages: ChatMessage[]) {
    if (!messages.length) return;
    this.set((s) =>
      withConv(s, id, (c) => {
        const merged = { ...c.messages };
        for (const m of messages) merged[m.seq] = m;
        const top = messages[messages.length - 1];
        const conv = top.seq > c.conv.last_seq ? { ...c.conv, last_seq: top.seq, last_message_at: top.created_at } : c.conv;
        return { ...c, messages: merged, conv };
      }),
    );
  }

  async loadLatest(id: string): Promise<void> {
    const res = await chatApi.history(id, { limit: PAGE });
    this.mergeMessages(id, res.messages);
    this.set((s) =>
      withConv(s, id, (c) => ({
        ...c,
        loaded: true,
        hasOlder: res.has_more,
        syncedSeq: contiguousFrom(c.syncedSeq, c.messages, c.conv.last_seq),
      })),
    );
  }

  async loadOlder(id: string): Promise<void> {
    const c = this.state.convs[id];
    if (!c) return;
    const oldest = Math.min(...Object.keys(c.messages).map(Number));
    const res = await chatApi.history(id, { before_seq: oldest, limit: PAGE });
    this.mergeMessages(id, res.messages);
    this.set((s) => withConv(s, id, (x) => ({ ...x, hasOlder: res.has_more })));
  }

  // ------------------------------------------------------------------ live events

  private apply(frame: EventFrame): void {
    switch (frame.type) {
      case "message.new":
        return this.onMessage(frame.data.message);
      case "message.updated": {
        const m = frame.data.message;
        this.set((s) =>
          withConv(s, m.conversation_id, (c) => ({
            ...c,
            messages: c.messages[m.seq] ? { ...c.messages, [m.seq]: m } : c.messages,
            conv: c.conv.last_message?.id === m.id ? { ...c.conv, last_message: m } : c.conv,
          })),
        );
        return;
      }
      case "receipt": {
        const r = frame.data;
        this.set((s) =>
          withConv(s, r.conversation_id, (c) => {
            const members = c.conv.members.map((m) =>
              m.user_id === r.user_id ? { ...m, delivered_seq: r.delivered_seq, read_seq: r.read_seq } : m,
            );
            let me = c.conv.me;
            if (r.user_id === this.state.meId && me) {
              me = { ...me, delivered_seq: r.delivered_seq, read_seq: r.read_seq, unread_count: Math.max(0, c.conv.last_seq - Math.max(r.read_seq, me.history_from_seq)) };
            }
            return { ...c, conv: { ...c.conv, members, me } };
          }),
        );
        return;
      }
      case "typing": {
        const { conversation_id, user_id } = frame.data;
        this.set((s) => ({
          ...s,
          typing: { ...s.typing, [conversation_id]: { ...s.typing[conversation_id], [user_id]: Date.now() + TYPING_TTL_MS } },
        }));
        return;
      }
      case "conversation.added":
        return this.upsertConversation(frame.data.conversation);
      case "conversation.updated": {
        const conv = frame.data.conversation;
        this.set((s) =>
          withConv(s, conv.id, (c) => ({
            ...c,
            // Broadcast views carry no per-user fields; keep ours.
            conv: { ...conv, me: c.conv.me, last_message: c.conv.last_message, last_seq: Math.max(conv.last_seq, c.conv.last_seq) },
          })),
        );
        return;
      }
      case "conversation.removed": {
        const id = frame.data.conversation_id;
        const c = this.state.convs[id];
        if (!c) return;
        this.set((s) => {
          const convs = { ...s.convs };
          delete convs[id];
          return { ...s, convs };
        });
        this.onRemoved(this.titleOf(c.conv));
        return;
      }
    }
  }

  private upsertConversation(conv: ChatConversation) {
    this.set((s) => {
      const prev = s.convs[conv.id];
      const messages = { ...(prev?.messages ?? {}) };
      if (conv.last_message) messages[conv.last_message.seq] = conv.last_message;
      return {
        ...s,
        convs: {
          ...s.convs,
          [conv.id]: prev
            ? { ...prev, conv: { ...prev.conv, ...conv }, messages }
            : { conv, messages, loaded: false, hasOlder: false, syncedSeq: conv.last_seq },
        },
      };
    });
    this.queueDelivered(conv.id);
  }

  private onMessage(m: ChatMessage) {
    const c = this.state.convs[m.conversation_id];
    if (!c) {
      // We don't know this conversation yet (e.g. conversation.added still in flight).
      void chatApi.conversation(m.conversation_id).then((conv) => this.upsertConversation(conv)).catch(() => {});
      return;
    }
    const meId = this.state.meId;
    const mine = m.sender_id === meId;
    const isActive = this.activeId === m.conversation_id && this.visible;
    this.set((s) => {
      const pending = { ...s.pending };
      if (mine && m.client_msg_id) delete pending[m.client_msg_id];
      const typing = m.sender_id && s.typing[m.conversation_id]?.[m.sender_id]
        ? { ...s.typing, [m.conversation_id]: { ...s.typing[m.conversation_id], [m.sender_id]: 0 } }
        : s.typing;
      const next = withConv({ ...s, pending, typing }, m.conversation_id, (x) => {
        const messages = { ...x.messages, [m.seq]: m };
        const lastSeq = Math.max(x.conv.last_seq, m.seq);
        // The sender has read everything up to their own message.
        const members = x.conv.members.map((mem) =>
          mem.user_id === m.sender_id
            ? { ...mem, read_seq: Math.max(mem.read_seq, m.seq), delivered_seq: Math.max(mem.delivered_seq, m.seq) }
            : mem,
        );
        let me = x.conv.me;
        if (me) {
          const read = mine ? Math.max(me.read_seq, m.seq) : me.read_seq;
          me = { ...me, read_seq: read, unread_count: isActive ? 0 : Math.max(0, lastSeq - Math.max(read, me.history_from_seq)) };
        }
        const isNewest = m.seq >= x.conv.last_seq;
        return {
          ...x,
          messages,
          syncedSeq: m.seq === x.syncedSeq + 1 ? contiguousFrom(m.seq, messages, lastSeq) : x.syncedSeq,
          conv: {
            ...x.conv,
            members,
            me,
            last_seq: lastSeq,
            last_message_at: isNewest ? m.created_at : x.conv.last_message_at,
            last_message: isNewest ? m : x.conv.last_message,
          },
        };
      });
      return next;
    });
    const after = this.state.convs[m.conversation_id];
    if (after && after.syncedSeq < m.seq) void this.fillGap(m.conversation_id); // missed something
    else this.queueDelivered(m.conversation_id);
    this.markReadIfActive();
  }

  // ------------------------------------------------------------------ receipts & typing

  private queueDelivered(id: string) {
    const c = this.state.convs[id];
    if (!c || !c.conv.me || c.syncedSeq <= c.conv.me.delivered_seq) return;
    this.deliveredWanted.set(id, c.syncedSeq);
    if (this.deliveredTimers.has(id)) return;
    this.deliveredTimers.set(
      id,
      setTimeout(() => {
        this.deliveredTimers.delete(id);
        const seq = this.deliveredWanted.get(id);
        if (seq !== undefined) this.socket.send("delivered", { conversation_id: id, seq });
      }, 300),
    );
  }

  setActive(id: string | null): void {
    this.activeId = id;
    if (id) {
      const c = this.state.convs[id];
      if (c && !c.loaded) void this.loadLatest(id).then(() => this.markReadIfActive());
    }
    this.markReadIfActive();
  }

  setVisible(visible: boolean): void {
    this.visible = visible;
    this.markReadIfActive();
  }

  private markReadIfActive() {
    const id = this.activeId;
    if (!id || !this.visible || this.buffer) return;
    const c = this.state.convs[id];
    if (!c?.conv.me) return;
    const seq = c.conv.last_seq;
    if (seq <= c.conv.me.read_seq || (this.readSent.get(id) ?? -1) >= seq) return;
    if (this.socket.send("read", { conversation_id: id, seq })) {
      this.readSent.set(id, seq);
      this.set((s) => withConv(s, id, (x) => (x.conv.me ? { ...x, conv: { ...x.conv, me: { ...x.conv.me, unread_count: 0 } } } : x)));
    }
  }

  typing(id: string): void {
    const now = Date.now();
    if (now - (this.lastTypingSent.get(id) ?? 0) < TYPING_THROTTLE_MS) return;
    if (this.socket.send("typing", { conversation_id: id })) this.lastTypingSent.set(id, now);
  }

  private expireTyping() {
    const now = Date.now();
    const typing = this.state.typing;
    let changed = false;
    const next: ChatState["typing"] = {};
    for (const [conv, users] of Object.entries(typing)) {
      const alive = Object.fromEntries(Object.entries(users).filter(([, exp]) => exp > now));
      if (Object.keys(alive).length !== Object.keys(users).length) changed = true;
      if (Object.keys(alive).length) next[conv] = alive;
    }
    if (changed) this.set((s) => ({ ...s, typing: next }));
  }

  // ------------------------------------------------------------------ sending

  send(conversationId: string, content: Pick<PendingMessage, "kind" | "body" | "payload" | "reply_to_id">): void {
    const p: PendingMessage = {
      ...content,
      client_msg_id: crypto.randomUUID(),
      conversation_id: conversationId,
      created_at: new Date().toISOString(),
      status: "queued",
      lastAttempt: 0,
    };
    this.set((s) => ({ ...s, pending: { ...s.pending, [p.client_msg_id]: p } }));
    this.savePending();
    void this.transmit(p.client_msg_id);
  }

  private async transmit(cmid: string): Promise<void> {
    const p = this.state.pending[cmid];
    if (!p || p.status === "sending" || !this.socket.isReady || this.buffer) return;
    this.updatePending(cmid, { status: "sending", lastAttempt: Date.now(), error: undefined });
    try {
      // Same client_msg_id on every retry → the server stores the message at most once.
      const ack = await this.socket.request("send", {
        conversation_id: p.conversation_id,
        client_msg_id: p.client_msg_id,
        kind: p.kind,
        body: p.body,
        payload: p.payload,
        reply_to_id: p.reply_to_id,
      });
      this.onMessage(ack.message as ChatMessage); // also removes the pending entry
      this.set((s) => {
        if (!s.pending[cmid]) return s;
        const pending = { ...s.pending };
        delete pending[cmid];
        return { ...s, pending };
      });
    } catch (err) {
      const code = err instanceof RequestError ? err.code : "internal";
      if (RETRYABLE.has(code)) this.updatePending(cmid, { status: "queued" });
      else this.updatePending(cmid, { status: "failed", error: err instanceof Error ? err.message : String(err) });
    }
    this.savePending();
  }

  private flushPending() {
    Object.values(this.state.pending)
      .filter((p) => p.status !== "failed")
      .sort((a, b) => a.created_at.localeCompare(b.created_at))
      .forEach((p) => {
        if (p.status === "sending") this.updatePending(p.client_msg_id, { status: "queued" });
        void this.transmit(p.client_msg_id);
      });
  }

  private retryQueued() {
    const now = Date.now();
    Object.values(this.state.pending)
      .filter((p) => p.status === "queued" && now - p.lastAttempt > RETRY_EVERY_MS)
      .forEach((p) => void this.transmit(p.client_msg_id));
  }

  retry(cmid: string): void {
    this.updatePending(cmid, { status: "queued", lastAttempt: 0 });
    void this.transmit(cmid);
  }

  discard(cmid: string): void {
    this.set((s) => {
      const pending = { ...s.pending };
      delete pending[cmid];
      return { ...s, pending };
    });
    this.savePending();
  }

  private updatePending(cmid: string, patch: Partial<PendingMessage>) {
    this.set((s) => (s.pending[cmid] ? { ...s, pending: { ...s.pending, [cmid]: { ...s.pending[cmid], ...patch } } } : s));
  }

  private loadPending(): Record<string, PendingMessage> {
    try {
      return JSON.parse(sessionStorage.getItem(this.pendingKey) ?? "{}");
    } catch {
      return {};
    }
  }

  private savePending() {
    try {
      sessionStorage.setItem(this.pendingKey, JSON.stringify(this.state.pending));
    } catch {
      /* storage full or unavailable: the queue still works in memory */
    }
  }

  async edit(messageId: string, body: string): Promise<void> {
    const ack = await this.socket.request("edit", { message_id: messageId, body });
    this.apply({ type: "message.updated", data: { message: ack.message as ChatMessage } });
  }

  async remove(messageId: string): Promise<void> {
    const ack = await this.socket.request("delete", { message_id: messageId });
    this.apply({ type: "message.updated", data: { message: ack.message as ChatMessage } });
  }

  // ------------------------------------------------------------------ conversations

  titleOf(conv: ChatConversation): string {
    return conv.title ?? (conv.kind === "direct" ? "Direct chat" : "Group chat");
  }
}

export function describeError(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
