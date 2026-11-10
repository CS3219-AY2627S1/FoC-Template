import { ApiRequestError } from "../api/client";
import type { ChatMessage, ReadState } from "../api/chat-service";

export type ChatFrame =
  | { type: "ready"; userId: string }
  | { type: "message.accepted"; requestId: string; message: ChatMessage }
  | { type: "message.created"; message: ChatMessage }
  | ({ type: "unread.updated"; requestId?: string } & ReadState)
  | { type: "sync.required"; reason: string; conversationId?: string }
  | { type: "pong"; requestId: string }
  | { type: "error"; requestId?: string; error: { code: string; message: string; correlationId?: string } };
export type ConnectionStatus = "connecting" | "ready" | "reconnecting" | "offline";
type Pending = { resolve: (message: ChatMessage) => void; reject: (error: Error) => void; timeout: ReturnType<typeof setTimeout> };
type Options = {
  getToken: () => Promise<string>;
  onFrame: (frame: ChatFrame) => void;
  onStatus: (status: ConnectionStatus) => void;
  socket?: (url: string) => WebSocket;
};

export function chatSocketUrl() {
  const url = new URL(`${import.meta.env.VITE_API_BASE_PATH ?? "/v1"}/chat/ws`, window.location.origin);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  return url.toString();
}

// A connection never queues sends. An uncertain outcome is retried explicitly with the same ID.
export class ChatConnection {
  private ws?: WebSocket;
  private stopped = true;
  private attempt = 0;
  private generation = 0;
  private retry?: ReturnType<typeof setTimeout>;
  private handshake?: ReturnType<typeof setTimeout>;
  private heartbeat?: ReturnType<typeof setInterval>;
  private lastFrame = 0;
  private pending = new Map<string, Pending>();
  private ready = false;
  constructor(private options: Options) {}

  start() { this.stopped = false; void this.connect(); }

  private async connect() {
    const generation = ++this.generation;
    this.options.onStatus(navigator.onLine === false ? "offline" : this.attempt ? "reconnecting" : "connecting");
    try {
      const token = await this.options.getToken();
      if (this.stopped || generation !== this.generation) return;
      const ws = (this.options.socket ?? ((url) => new WebSocket(url)))(chatSocketUrl());
      this.ws = ws;
      this.handshake = setTimeout(() => ws.close(4000, "Authentication timed out"), 8000);
      ws.onopen = () => { if (!this.stopped) ws.send(JSON.stringify({ type: "authenticate", accessToken: token })); };
      ws.onmessage = (event) => {
        if (this.stopped || ws !== this.ws) return;
        let frame: ChatFrame;
        try { frame = JSON.parse(String(event.data)) as ChatFrame; } catch { return; }
        if (!frame || typeof frame.type !== "string") return;
        this.lastFrame = Date.now();
        if (frame.type === "ready") {
          clearTimeout(this.handshake);
          this.ready = true;
          this.attempt = 0;
          this.options.onStatus("ready");
          this.heartbeat = setInterval(() => {
            if (Date.now() - this.lastFrame > 45000) { ws.close(4000, "Connection lost"); return; }
            ws.send(JSON.stringify({ type: "ping", requestId: crypto.randomUUID() }));
          }, 20000);
        }
        this.options.onFrame(frame);
        if (frame.type === "message.accepted") {
          const pending = this.pending.get(frame.requestId);
          if (pending) { clearTimeout(pending.timeout); this.pending.delete(frame.requestId); pending.resolve(frame.message); }
        } else if (frame.type === "error" && frame.requestId) {
          const pending = this.pending.get(frame.requestId);
          if (pending) {
            clearTimeout(pending.timeout); this.pending.delete(frame.requestId);
            pending.reject(new ApiRequestError(frame.error.code === "INVALID_SESSION" ? 401 : 409, frame.error.message, frame.error));
          }
        }
      };
      ws.onerror = () => ws.close();
      ws.onclose = () => {
        if (ws !== this.ws) return;
        this.ready = false;
        clearInterval(this.heartbeat); clearTimeout(this.handshake);
        this.failPending();
        this.schedule();
      };
    } catch { if (!this.stopped && generation === this.generation) this.schedule(); }
  }

  private schedule() {
    if (this.stopped) return;
    this.options.onStatus(navigator.onLine === false ? "offline" : "reconnecting");
    clearTimeout(this.retry);
    this.retry = setTimeout(() => void this.connect(), Math.min(1000 * 2 ** this.attempt++, 15000));
  }

  reconnect() {
    if (this.stopped) return;
    clearTimeout(this.retry);
    if (this.ws && this.ws.readyState < 2) this.ws.close(4000, "Reconnect requested");
    else void this.connect();
  }

  send(conversationId: string, clientMessageId: string, text: string): Promise<ChatMessage> {
    if (!this.ready || this.ws?.readyState !== WebSocket.OPEN) return Promise.reject(new ApiRequestError(0, "Reconnect, then retry this message.", { code: "CONNECTION_UNAVAILABLE" }));
    const requestId = crypto.randomUUID();
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(requestId);
        reject(new ApiRequestError(0, "Sending could not be confirmed. Retry to check the result.", { code: "SEND_UNCERTAIN" }));
      }, 12000);
      this.pending.set(requestId, { resolve, reject, timeout });
      try { this.ws!.send(JSON.stringify({ type: "message.send", requestId, conversationId, clientMessageId, text })); }
      catch { clearTimeout(timeout); this.pending.delete(requestId); reject(new ApiRequestError(0, "Reconnect, then retry this message.", { code: "SEND_UNCERTAIN" })); }
    });
  }

  private failPending() {
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timeout);
      pending.reject(new ApiRequestError(0, "Sending could not be confirmed. Retry to check the result.", { code: "SEND_UNCERTAIN" }));
    }
    this.pending.clear();
  }

  stop() {
    this.stopped = true; this.ready = false; ++this.generation;
    clearTimeout(this.retry); clearTimeout(this.handshake); clearInterval(this.heartbeat);
    this.ws?.close(); this.failPending();
  }
}
