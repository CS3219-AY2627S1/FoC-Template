// AI-assisted (Claude Opus 5.5): WebSocket protocol client for chat-service,
// ported from the standalone chat demo and switched to one-time tickets.
// Reviewed by authors.
import { ApiError } from "../api";
import type { EventFrame, ServerFrame } from "./types";

export type SocketStatus = "connecting" | "ready" | "offline";

export class RequestError extends Error {
  code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "RequestError";
    this.code = code;
  }
}

interface Handlers {
  onReady: () => void;
  onEvent: (frame: EventFrame) => void;
  onStatus: (status: SocketStatus) => void;
  /** The login is no longer valid (the ticket request was refused with 401). */
  onAuthFailed: () => void;
}

interface Pending {
  resolve: (data: Record<string, unknown>) => void;
  reject: (err: RequestError) => void;
  timer: ReturnType<typeof setTimeout>;
}

const HEARTBEAT_MS = 25_000;
const PONG_TIMEOUT_MS = 10_000;
const MAX_BACKOFF_MS = 30_000;
const CLOSE_SESSION_EXPIRED = 4002;
const CLOSE_RATE_LIMITED = 4008;

/**
 * Thin protocol client: req_id -> ack/error matching, an app-level heartbeat
 * (browsers cannot see protocol pings) and reconnects with exponential backoff
 * and jitter. Every connection attempt first fetches a one-time ticket over
 * authenticated HTTP, so the JWT never appears in a WebSocket URL, and a
 * logged-out or expired session cannot reconnect.
 */
export class ChatSocket {
  private ws: WebSocket | null = null;
  private status: SocketStatus = "offline";
  private attempt = 0;
  private reqCounter = 0;
  private pending = new Map<string, Pending>();
  private heartbeat: ReturnType<typeof setInterval> | null = null;
  private pongTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private stopped = false;
  private opening = false;

  constructor(
    /** Resolves to a ready-to-open URL that carries a fresh ticket. */
    private connectUrl: () => Promise<string>,
    private handlers: Handlers,
  ) {}

  get isReady(): boolean {
    return this.status === "ready";
  }

  start(): void {
    this.stopped = false;
    window.addEventListener("online", this.onOnline);
    void this.open();
  }

  stop(): void {
    this.stopped = true;
    window.removeEventListener("online", this.onOnline);
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.ws?.close(1000, "bye");
    this.cleanup("stopped");
    this.setStatus("offline");
  }

  /** Fire-and-forget (receipts, typing). Dropped while not connected. */
  send(type: string, data?: unknown): boolean {
    if (!this.isReady || !this.ws) return false;
    this.ws.send(JSON.stringify({ type, data }));
    return true;
  }

  /** Request that expects an ack (or error) carrying the same req_id. */
  request(type: string, data: unknown, timeoutMs = 10_000): Promise<Record<string, unknown>> {
    if (!this.isReady || !this.ws) {
      return Promise.reject(new RequestError("disconnected", "not connected"));
    }
    const reqId = `r${++this.reqCounter}`;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(reqId);
        reject(new RequestError("timeout", "no reply from server"));
      }, timeoutMs);
      this.pending.set(reqId, { resolve, reject, timer });
      this.ws!.send(JSON.stringify({ type, req_id: reqId, data }));
    });
  }

  private onOnline = () => {
    if (this.status === "offline" && !this.stopped) {
      if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
      void this.open();
    }
  };

  private setStatus(status: SocketStatus) {
    if (this.status !== status) {
      this.status = status;
      this.handlers.onStatus(status);
    }
  }

  private async open(): Promise<void> {
    if (this.opening || this.stopped) return;
    this.opening = true;
    this.setStatus("connecting");
    let url: string;
    try {
      url = await this.connectUrl();
    } catch (err) {
      this.opening = false;
      if (err instanceof ApiError && err.status === 401) {
        this.setStatus("offline");
        this.handlers.onAuthFailed();
        return;
      }
      this.scheduleReconnect(1);
      return;
    }
    this.opening = false;
    if (this.stopped) return;

    const ws = new WebSocket(url);
    this.ws = ws;
    ws.onmessage = (ev) => this.onMessage(JSON.parse(ev.data) as ServerFrame);
    ws.onclose = (ev) => {
      if (this.ws !== ws) return;
      this.cleanup("disconnected");
      if (this.stopped) return;
      if (ev.code === CLOSE_SESSION_EXPIRED) {
        // Routine re-authentication: reconnect straight away with a new ticket.
        this.attempt = 0;
        this.setStatus("offline");
        void this.open();
        return;
      }
      this.scheduleReconnect(ev.code === CLOSE_RATE_LIMITED ? 10 : 1);
    };
  }

  private onMessage(frame: ServerFrame) {
    switch (frame.type) {
      case "ready":
        this.attempt = 0;
        this.setStatus("ready");
        this.startHeartbeat();
        this.handlers.onReady();
        return;
      case "ack":
      case "error":
      case "pong": {
        if (frame.type === "pong" && this.pongTimer) {
          clearTimeout(this.pongTimer);
          this.pongTimer = null;
        }
        const p = frame.req_id ? this.pending.get(frame.req_id) : undefined;
        if (!p || !frame.req_id) return;
        clearTimeout(p.timer);
        this.pending.delete(frame.req_id);
        if (frame.type === "error") p.reject(new RequestError(frame.data.code, frame.data.message));
        else p.resolve(frame.type === "ack" ? frame.data : {});
        return;
      }
      default:
        this.handlers.onEvent(frame);
    }
  }

  private startHeartbeat() {
    this.heartbeat = setInterval(() => {
      if (!this.ws || this.pongTimer) return;
      this.ws.send(JSON.stringify({ type: "ping", req_id: "hb" }));
      // No pong in time: the connection is dead even if the browser has not
      // noticed (e.g. after switching networks). Close it and reconnect.
      this.pongTimer = setTimeout(() => this.ws?.close(4000, "heartbeat timeout"), PONG_TIMEOUT_MS);
    }, HEARTBEAT_MS);
  }

  private scheduleReconnect(multiplier: number) {
    this.setStatus("offline");
    const ceiling = Math.min(MAX_BACKOFF_MS, 1000 * 2 ** this.attempt) * multiplier;
    const delay = ceiling / 2 + Math.random() * (ceiling / 2); // jitter spreads reconnect storms
    this.attempt += 1;
    this.reconnectTimer = setTimeout(
      () => void this.open(),
      Math.min(delay, MAX_BACKOFF_MS * multiplier),
    );
  }

  private cleanup(reason: string) {
    if (this.heartbeat) clearInterval(this.heartbeat);
    if (this.pongTimer) clearTimeout(this.pongTimer);
    this.heartbeat = null;
    this.pongTimer = null;
    for (const p of this.pending.values()) {
      clearTimeout(p.timer);
      p.reject(new RequestError("disconnected", reason));
    }
    this.pending.clear();
    this.ws = null;
  }
}
