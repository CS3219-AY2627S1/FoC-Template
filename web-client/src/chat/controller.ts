import { chatService, mergeMessages, messageValidation, type ChatMessage, type ChatPerson, type Conversation, type ReadState } from "../api/chat-service";
import { isApiRequestError } from "../api/client";
import type { AuthContextValue } from "../app/auth-context";
import { ChatConnection, type ChatFrame, type ConnectionStatus } from "./connection";

export type DraftMessage = { clientMessageId: string; conversationId: string; text: string; createdAt: string; status: "pending" | "failed"; error?: string };
export type ChatThread = { messages: ChatMessage[]; boundary: number; lastRead: number; hasMore: boolean; loaded: boolean; loading: boolean; recovering: boolean; error?: string; readError?: string };
export type ChatSnapshot = {
  conversations: Conversation[]; nextCursor: string | null; listLoading: boolean; listError?: string;
  blocks: ChatPerson[]; blocksLoading: boolean; blocksError?: string;
  threads: Record<string, ChatThread>; drafts: DraftMessage[]; connection: ConnectionStatus;
};
type Access = AuthContextValue["withCurrentAccess"];
type Transport = Pick<ChatConnection, "start" | "stop" | "send" | "reconnect">;
const emptyThread = (): ChatThread => ({ messages: [], boundary: 0, lastRead: 0, hasMore: false, loaded: false, loading: false, recovering: false });
export function chatFailure(error: unknown) {
  if (isApiRequestError(error)) {
    if (error.code === "MESSAGING_BLOCKED") return "Messaging is blocked. Your message was not sent.";
    if (error.code === "RECIPIENT_UNAVAILABLE") return "This account is no longer available. Your message was not sent.";
    if (error.code === "CONVERSATION_NOT_FOUND") return "This conversation is unavailable.";
    if (error.code === "INVALID_SESSION") return "Your session has ended. Sign in again.";
    if (error.code === "SERVICE_NOT_READY") return "Messages are temporarily unavailable. Try again shortly.";
    return error.message;
  }
  return "Check your connection and try again.";
}

export class ChatController {
  private state: ChatSnapshot = { conversations: [], nextCursor: null, listLoading: true, blocks: [], blocksLoading: true, threads: {}, drafts: [], connection: "connecting" };
  private listeners = new Set<() => void>();
  private live = false;
  private generation = 0;
  private refreshNumber = 0;
  private selected?: string;
  private active = false;
  private reading = new Set<string>();
  private recovering = new Set<string>();
  private recoverAgain = new Set<string>();
  readonly transport: Transport;
  constructor(private userId: string, private access: Access, getToken: () => Promise<string>, transport?: (onFrame: (frame: ChatFrame) => void, onStatus: (status: ConnectionStatus) => void) => Transport) {
    const onStatus = (connection: ConnectionStatus) => {
      this.patch({ connection });
      if (connection === "ready") this.synchronize();
    };
    this.transport = transport?.(this.receive, onStatus) ?? new ChatConnection({ getToken, onFrame: this.receive, onStatus });
  }
  getSnapshot = () => this.state;
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  private patch(changes: Partial<ChatSnapshot>) {
    if (!this.live) return;
    this.state = { ...this.state, ...changes };
    for (const listener of this.listeners) listener();
  }
  private thread(id: string, changes: Partial<ChatThread>) {
    this.patch({ threads: { ...this.state.threads, [id]: { ...(this.state.threads[id] ?? emptyThread()), ...changes } } });
  }
  private putConversations(incoming: Conversation[]) {
    const items = new Map(this.state.conversations.map((item) => [item.conversationId, item]));
    for (const item of incoming) {
      const current = items.get(item.conversationId);
      items.set(item.conversationId, current ? {
        ...item,
        lastReadSequence: Math.max(current.lastReadSequence, item.lastReadSequence),
        ...(current.lastReadSequence > item.lastReadSequence ? { unreadCount: current.unreadCount } : {}),
        ...(current.lastSequence > item.lastSequence ? { lastSequence: current.lastSequence, latestMessage: current.latestMessage } : {}),
      } : item);
    }
    this.patch({ conversations: [...items.values()].sort((a, b) => (b.latestMessage?.createdAt ?? b.createdAt).localeCompare(a.latestMessage?.createdAt ?? a.createdAt)) });
  }
  start() {
    this.live = true; ++this.generation;
    this.patch({ threads: Object.fromEntries(Object.entries(this.state.threads).map(([id, thread]) => [id, { ...thread, loading: false, recovering: false }])) });
    void this.refresh(); void this.refreshBlocks(); this.transport.start();
  }
  stop() { this.live = false; ++this.generation; this.transport.stop(); this.reading.clear(); this.recovering.clear(); this.recoverAgain.clear(); }

  async refresh(more = false) {
    const cursor = more ? this.state.nextCursor ?? undefined : undefined;
    if (more && !cursor) return;
    const number = ++this.refreshNumber, generation = this.generation;
    this.patch({ listLoading: true, listError: undefined });
    try {
      const loadedCount = this.state.conversations.length;
      let page = await this.access((token) => chatService.conversations(token, cursor));
      const items = [...page.items];
      // Refresh every already displayed page, including current names on later pages.
      while (!more && page.nextCursor && items.length < loadedCount) {
        const nextCursor = page.nextCursor;
        page = await this.access((token) => chatService.conversations(token, nextCursor));
        if (!this.live || generation !== this.generation || number !== this.refreshNumber) return;
        items.push(...page.items);
      }
      if (!this.live || generation !== this.generation || number !== this.refreshNumber) return;
      this.putConversations(items);
      this.patch({ nextCursor: page.nextCursor });
    } catch (error) { if (generation === this.generation && number === this.refreshNumber) this.patch({ listError: chatFailure(error) }); }
    finally { if (generation === this.generation && number === this.refreshNumber) this.patch({ listLoading: false }); }
  }

  async refreshBlocks() {
    const generation = this.generation;
    this.patch({ blocksLoading: true, blocksError: undefined });
    try {
      const items: ChatPerson[] = [];
      let cursor: string | undefined;
      do {
        const page = await this.access((token) => chatService.blocks(token, cursor));
        if (!this.live || generation !== this.generation) return;
        items.push(...page.items); cursor = page.nextCursor ?? undefined;
      } while (cursor);
      this.patch({ blocks: items });
    } catch (error) { if (generation === this.generation) this.patch({ blocksError: chatFailure(error) }); }
    finally { if (generation === this.generation) this.patch({ blocksLoading: false }); }
  }

  select(id?: string) {
    this.selected = id;
    if (!id) return;
    if (!this.state.threads[id]?.loaded) void this.loadThread(id);
    else { void this.metadata(id); void this.recover(id); }
  }
  setActive(active: boolean) { this.active = active; }

  async loadThread(id: string) {
    const generation = this.generation;
    if (this.state.threads[id]?.loading) return;
    this.thread(id, { loading: true, error: undefined });
    try {
      const [summary, history] = await this.access((token) => Promise.all([chatService.conversation(id, token), chatService.history(id, token)]));
      if (!this.live || generation !== this.generation) return;
      this.putConversations([summary]);
      this.reconcileDrafts(history.items);
      this.thread(id, { messages: history.items, boundary: history.boundarySequence, lastRead: Math.max(this.state.threads[id]?.lastRead ?? 0, history.lastReadSequence), hasMore: history.hasMore, loaded: true });
      // Close the race between taking the initial snapshot and subscribing to live frames.
      void this.recover(id);
    } catch (error) { if (generation === this.generation) this.thread(id, { error: chatFailure(error) }); }
    finally { if (generation === this.generation) this.thread(id, { loading: false }); }
  }

  async older(id: string) {
    const thread = this.state.threads[id], generation = this.generation;
    if (!thread?.loaded || thread.loading || !thread.hasMore) return;
    this.thread(id, { loading: true, error: undefined });
    try {
      const page = await this.access((token) => chatService.history(id, token, { beforeSequence: thread.messages[0].sequence }));
      if (!this.live || generation !== this.generation) return;
      this.thread(id, { messages: mergeMessages(this.state.threads[id].messages, page.items), hasMore: page.hasMore });
    } catch (error) { if (generation === this.generation) this.thread(id, { error: chatFailure(error) }); }
    finally { if (generation === this.generation) this.thread(id, { loading: false }); }
  }

  private async metadata(id: string) {
    const generation = this.generation;
    try {
      const summary = await this.access((token) => chatService.conversation(id, token));
      if (this.live && generation === this.generation) this.putConversations([summary]);
    } catch (error) { if (generation === this.generation) this.thread(id, { error: chatFailure(error) }); }
  }

  async recover(id: string) {
    if (!this.live || !this.state.threads[id]?.loaded) return;
    if (this.recovering.has(id)) { this.recoverAgain.add(id); return; }
    const generation = this.generation;
    this.recovering.add(id); this.thread(id, { recovering: true, error: undefined });
    try {
      let more: boolean;
      do {
        const afterSequence = this.state.threads[id].boundary;
        const page = await this.access((token) => chatService.history(id, token, { afterSequence }));
        if (!this.live || generation !== this.generation) return;
        this.reconcileDrafts(page.items);
        const current = this.state.threads[id];
        const boundary = page.hasMore ? (page.items.at(-1)?.sequence ?? afterSequence) : page.boundarySequence;
        this.thread(id, { messages: mergeMessages(current.messages, page.items), boundary: Math.max(current.boundary, boundary), lastRead: Math.max(current.lastRead, page.lastReadSequence) });
        more = page.hasMore;
      } while (more);
    } catch (error) { if (generation === this.generation) this.thread(id, { error: chatFailure(error) }); }
    finally {
      if (generation === this.generation) {
        this.recovering.delete(id); this.thread(id, { recovering: false });
        if (this.recoverAgain.delete(id)) void this.recover(id);
      }
    }
  }

  synchronize = () => {
    if (!this.live) return;
    void this.refresh(); void this.refreshBlocks();
    for (const [id, thread] of Object.entries(this.state.threads)) if (thread.loaded) {
      this.thread(id, { readError: undefined }); void this.recover(id);
    }
    if (this.selected) void this.metadata(this.selected);
  };

  acknowledgeVisible = async (id: string) => {
    const thread = this.state.threads[id], generation = this.generation;
    if (!this.live || id !== this.selected || !this.active || !thread?.loaded || thread.recovering || thread.error || thread.readError || thread.boundary <= thread.lastRead || this.reading.has(id)) return;
    this.reading.add(id);
    try {
      const result = await this.access((token) => chatService.read(id, thread.boundary, token));
      if (this.live && generation === this.generation) this.applyRead(result);
    } catch { if (generation === this.generation) this.thread(id, { readError: "Read status could not be saved. Retry when connected." }); }
    finally {
      if (generation === this.generation) {
        this.reading.delete(id);
        // Notify after releasing the lock so the next rendered boundary can be acknowledged.
        this.patch({ threads: { ...this.state.threads } });
      }
    }
  };

  retryRead(id: string) { this.thread(id, { readError: undefined }); }
  private applyRead(result: ReadState) {
    const thread = this.state.threads[result.conversationId];
    if (thread && result.lastReadSequence >= thread.lastRead) this.thread(result.conversationId, { lastRead: result.lastReadSequence, readError: undefined });
    const summary = this.state.conversations.find((item) => item.conversationId === result.conversationId);
    if (summary && result.lastReadSequence >= summary.lastReadSequence && result.boundarySequence >= summary.lastSequence) this.putConversations([{ ...summary, lastReadSequence: result.lastReadSequence, unreadCount: result.unreadCount }]);
    else void this.refresh();
  }

  private reconcileDrafts(messages: ChatMessage[]) {
    const accepted = new Set(messages.filter((message) => message.senderUserId === this.userId).map((message) => message.clientMessageId));
    if (accepted.size) this.patch({ drafts: this.state.drafts.filter((draft) => !accepted.has(draft.clientMessageId)) });
  }

  receive = (frame: ChatFrame) => {
    if (!this.live) return;
    if (frame.type === "message.created" || frame.type === "message.accepted") {
      const message = frame.message, id = message.conversationId, thread = this.state.threads[id];
      this.reconcileDrafts([message]);
      if (!this.state.conversations.some((item) => item.conversationId === id)) void this.metadata(id);
      if (thread?.loaded) {
        if (message.sequence < (thread.messages[0]?.sequence ?? 0)) { /* Older history stays behind its pagination boundary. */ }
        else if (message.sequence <= thread.boundary + 1) this.thread(id, { messages: mergeMessages(thread.messages, [message]), boundary: Math.max(thread.boundary, message.sequence) });
        else void this.recover(id);
      }
      void this.refresh();
    } else if (frame.type === "unread.updated") this.applyRead(frame);
    else if (frame.type === "sync.required") this.synchronize();
    else if (frame.type === "pong" && this.selected && this.state.threads[this.selected]?.readError) this.retryRead(this.selected);
  };

  send(id: string, text: string) {
    const error = messageValidation(text);
    if (error) throw new Error(error);
    const draft: DraftMessage = { conversationId: id, clientMessageId: crypto.randomUUID(), text, createdAt: new Date().toISOString(), status: "pending" };
    this.patch({ drafts: [...this.state.drafts, draft] });
    void this.transmit(draft);
  }
  retry(draft: DraftMessage) {
    if (!this.state.drafts.some((item) => item.clientMessageId === draft.clientMessageId && item.status === "failed")) return;
    this.patch({ drafts: this.state.drafts.map((item) => item.clientMessageId === draft.clientMessageId ? { ...item, status: "pending", error: undefined } : item) });
    void this.transmit(draft);
  }
  discard(id: string) { this.patch({ drafts: this.state.drafts.filter((draft) => draft.clientMessageId !== id) }); }
  private async transmit(draft: DraftMessage) {
    const generation = this.generation;
    try {
      const message = await this.transport.send(draft.conversationId, draft.clientMessageId, draft.text);
      if (this.live && generation === this.generation) this.receive({ type: "message.accepted", requestId: "", message });
    } catch (error) {
      if (!this.live || generation !== this.generation) return;
      this.patch({ drafts: this.state.drafts.map((item) => item.clientMessageId === draft.clientMessageId ? { ...item, status: "failed", error: chatFailure(error) } : item) });
      void this.metadata(draft.conversationId);
    }
  }

  async block(userId: string, enabled: boolean) {
    const generation = this.generation;
    const result = await this.access((token) => chatService.block(userId, enabled, token));
    if (!this.live || generation !== this.generation) return;
    this.putConversations(this.state.conversations.filter((item) => item.counterpart.userId === userId).map((item) => ({ ...item, blocked: result.messagingBlocked, messagingAvailable: !result.messagingBlocked && item.counterpart.accountStatus === "ACTIVE" })));
    await this.refreshBlocks();
    void this.refresh();
  }
}
