import type { Page, WebSocketRoute } from "@playwright/test";
import type { ChatMessage, ChatPerson } from "../../src/api/chat-service";

// Browser-only contract fixture. Production always uses Chat/User HTTP and real WebSockets.
export class ChatFixture {
  alice = { userId: "alice", username: "alice", displayName: "Alice Tan", accountStatus: "ACTIVE" } as ChatPerson;
  bob = { userId: "bob", username: "bob", displayName: "Bob Lim", accountStatus: "ACTIVE" } as ChatPerson;
  messages: ChatMessage[] = [];
  reads = new Map<string, number>();
  blocks = new Set<string>();
  sockets = new Map<WebSocketRoute, string>();
  sends: Array<{ clientMessageId: string; text: string }> = [];
  rejectNextSend = false;
  failNextRead = false;
  openPair = true;
  conversationCount = 1;
  private summary(me: string) {
    const counterpart = me === "alice" ? this.bob : this.alice;
    const lastReadSequence = this.reads.get(me) ?? 0;
    const blocked = this.blocks.size > 0;
    return { conversationId: "ab", counterpart, latestMessage: this.messages.at(-1) ?? null, createdAt: "2026-10-21T00:00:00Z", lastSequence: this.messages.length, lastReadSequence, unreadCount: this.messages.filter((message) => message.senderUserId !== me && message.sequence > lastReadSequence).length, blocked, messagingAvailable: !blocked && counterpart.accountStatus === "ACTIVE" };
  }
  emit(me: string, frame: unknown) { for (const [ws, user] of this.sockets) if (user === me) ws.send(JSON.stringify(frame)); }
  message(senderUserId: string, text: string, clientMessageId = crypto.randomUUID()) {
    const message: ChatMessage = { messageId: crypto.randomUUID(), conversationId: "ab", senderUserId, clientMessageId, sequence: this.messages.length + 1, text: text.trim(), createdAt: new Date().toISOString() };
    this.messages.push(message); return message;
  }
  async install(page: Page, me = "alice") {
    const person = me === "alice" ? this.alice : this.bob;
    const session = { accessToken: `${me}-test-token`, tokenType: "Bearer", expiresAt: "2030-01-01T00:00:00Z" };
    await page.route("**/v1/auth/sessions/refresh", (route) => route.fulfill({ json: session }));
    await page.route("**/v1/users/me", (route) => route.fulfill({ json: { ...person, email: `${me}@u.nus.edu`, systemRole: "USER" } }));
    await page.route("**/v1/chat/**", async (route) => {
      const url = new URL(route.request().url()), method = route.request().method();
      const error = (code: string, status: number) => route.fulfill({ status, json: { error: { code, message: code === "CONVERSATION_NOT_FOUND" ? "Conversation unavailable" : "Temporarily unavailable", fieldErrors: [], correlationId: "test" } } });
      if (url.pathname === "/v1/chat/users") return route.fulfill({ json: { items: this.bob.accountStatus === "ACTIVE" && "bob".includes(url.searchParams.get("username") ?? "") ? [{ userId: "bob", username: "bob" }] : [], nextCursor: null } });
      if (url.pathname === "/v1/chat/blocks") return route.fulfill({ json: { items: this.blocks.has(me) ? [me === "alice" ? this.bob : this.alice] : [], nextCursor: null } });
      if (url.pathname.startsWith("/v1/chat/blocks/")) {
        if (method === "PUT") this.blocks.add(me); else this.blocks.delete(me);
        return route.fulfill({ json: { userId: me === "alice" ? "bob" : "alice", blockedByMe: this.blocks.has(me), messagingBlocked: this.blocks.size > 0 } });
      }
      if (url.pathname === "/v1/chat/conversations") {
        if (method === "POST") { this.openPair = true; return route.fulfill({ json: { conversationId: "ab" } }); }
        return route.fulfill({ json: { items: this.openPair ? Array.from({ length: this.conversationCount }, (_, index) => ({ ...this.summary(me), conversationId: index ? `other-${index}` : "ab" })) : [], nextCursor: null } });
      }
      if (!url.pathname.startsWith("/v1/chat/conversations/ab")) return error("CONVERSATION_NOT_FOUND", 404);
      if (url.pathname.endsWith("/messages")) {
        const before = Number(url.searchParams.get("beforeSequence") ?? Infinity), after = url.searchParams.has("afterSequence") ? Number(url.searchParams.get("afterSequence")) : undefined;
        const matches = this.messages.filter((message) => after !== undefined ? message.sequence > after : message.sequence < before);
        return route.fulfill({ json: { items: after !== undefined ? matches.slice(0, 50) : matches.slice(-50), boundarySequence: this.messages.length, lastReadSequence: this.reads.get(me) ?? 0, hasMore: matches.length > 50 } });
      }
      if (url.pathname.endsWith("/read")) {
        if (this.failNextRead) { this.failNextRead = false; return error("SERVICE_NOT_READY", 503); }
        const sequence = route.request().postDataJSON().upToSequence;
        this.reads.set(me, Math.max(this.reads.get(me) ?? 0, sequence));
        const frame = { conversationId: "ab", lastReadSequence: this.reads.get(me), boundarySequence: this.messages.length, unreadCount: this.summary(me).unreadCount };
        this.emit(me, { type: "unread.updated", ...frame });
        return route.fulfill({ json: frame });
      }
      return route.fulfill({ json: this.summary(me) });
    });
    await page.routeWebSocket("**/v1/chat/ws", (ws) => {
      ws.onMessage((raw) => {
        const frame = JSON.parse(String(raw));
        if (frame.type === "authenticate") { this.sockets.set(ws, me); ws.send(JSON.stringify({ type: "ready", userId: me })); return; }
        if (frame.type === "ping") { ws.send(JSON.stringify({ type: "pong", requestId: frame.requestId })); return; }
        if (frame.type !== "message.send") return;
        this.sends.push(frame);
        if (this.rejectNextSend) { this.rejectNextSend = false; ws.close({ code: 1013, reason: "connection interrupted" }); return; }
        if (this.blocks.size || this.bob.accountStatus === "DELETED") { ws.send(JSON.stringify({ type: "error", requestId: frame.requestId, error: { code: this.blocks.size ? "MESSAGING_BLOCKED" : "RECIPIENT_UNAVAILABLE", message: "Messaging unavailable" } })); return; }
        const message = this.messages.find((message) => message.senderUserId === me && message.clientMessageId === frame.clientMessageId) ?? this.message(me, frame.text, frame.clientMessageId);
        ws.send(JSON.stringify({ type: "message.accepted", requestId: frame.requestId, message }));
        for (const [other] of this.sockets) other.send(JSON.stringify({ type: "message.created", message }));
      });
      ws.onClose(() => this.sockets.delete(ws));
    });
  }
}
