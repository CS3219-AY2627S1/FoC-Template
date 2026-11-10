import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ChatConnection, chatSocketUrl, type ChatFrame } from "../../src/chat/connection";

class Socket {
  readyState = 0;
  onopen?: () => void;
  onmessage?: (event: { data: string }) => void;
  onclose?: () => void;
  onerror?: () => void;
  send = vi.fn();
  close = vi.fn(() => { this.readyState = 3; this.onclose?.(); });
  open() { this.readyState = 1; this.onopen?.(); }
  frame(frame: ChatFrame) { this.onmessage?.({ data: JSON.stringify(frame) }); }
}
let connection: ChatConnection;
let sockets: Socket[];
let getToken: ReturnType<typeof vi.fn>;
beforeEach(() => {
  vi.useFakeTimers(); sockets = []; getToken = vi.fn().mockResolvedValue("token-one");
  connection = new ChatConnection({ getToken, onFrame: vi.fn(), onStatus: vi.fn(), socket: () => { const socket = new Socket(); sockets.push(socket); return socket as unknown as WebSocket; } });
});
afterEach(() => { connection.stop(); vi.useRealTimers(); });
async function start() { connection.start(); await vi.advanceTimersByTimeAsync(0); sockets[0].open(); }

it("authenticates in the first frame and keeps credentials out of the URL", async () => {
  await start();
  expect(chatSocketUrl()).not.toContain("token");
  expect(sockets[0].send).toHaveBeenCalledWith(JSON.stringify({ type: "authenticate", accessToken: "token-one" }));
  await expect(connection.send("ab", "client", "hello")).rejects.toMatchObject({ code: "CONNECTION_UNAVAILABLE" });
});
it("times out uncertain acceptance and uses the exact same client ID on explicit retry", async () => {
  await start(); sockets[0].frame({ type: "ready", userId: "alice" });
  const result = connection.send("ab", "client-original", "Hello");
  const failed = expect(result).rejects.toMatchObject({ code: "SEND_UNCERTAIN" });
  await vi.advanceTimersByTimeAsync(12000); await failed;
  const retry = connection.send("ab", "client-original", "Hello");
  const command = JSON.parse(sockets[0].send.mock.calls.at(-1)![0]);
  expect(command.clientMessageId).toBe("client-original");
  sockets[0].frame({ type: "error", requestId: command.requestId, error: { code: "MESSAGING_BLOCKED", message: "Blocked" } });
  await expect(retry).rejects.toMatchObject({ code: "MESSAGING_BLOCKED" });
});
it("revalidates the session before reconnecting and sends heartbeat pings", async () => {
  await start(); sockets[0].frame({ type: "ready", userId: "alice" });
  await vi.advanceTimersByTimeAsync(20000);
  expect(JSON.parse(sockets[0].send.mock.calls.at(-1)![0]).type).toBe("ping");
  sockets[0].close(); getToken.mockResolvedValue("refreshed-token");
  await vi.advanceTimersByTimeAsync(1000); sockets[1].open();
  expect(getToken).toHaveBeenCalledTimes(2);
  expect(JSON.parse(sockets[1].send.mock.calls[0][0]).accessToken).toBe("refreshed-token");
});
it("cleans up timers and never reconnects after leaving Chat", async () => {
  await start(); connection.stop();
  await vi.advanceTimersByTimeAsync(60000);
  expect(sockets).toHaveLength(1);
  expect(vi.getTimerCount()).toBe(0);
});
