// @vitest-environment node
import { createHash } from "node:crypto";
import { createServer as createHttpServer, request, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, expect, it } from "vitest";
import { createServer, type ViteDevServer } from "vite";
import viteConfig from "../../vite.config";

const backends: Server[] = [];
let vite: ViteDevServer;
let baseUrl: string;
let websocketRequest: { path?: string; origin?: string; correlationId?: string };

// Small valid WebSocket text frames exercise the proxy's bidirectional tunnel.
const ping = Buffer.from('{"type":"ping"}');
const mask = Buffer.from([1, 2, 3, 4]);
const clientFrame = Buffer.concat([
  Buffer.from([0x81, 0x80 | ping.length]), mask,
  Buffer.from(ping.map((byte, index) => byte ^ mask[index % 4])),
]);
const pong = Buffer.from('{"type":"pong"}');
const serverFrame = Buffer.concat([Buffer.from([0x81, pong.length]), pong]);

beforeAll(async () => {
  const targets = new Map<string, string>();
  for (const [target, service] of [
    ["http://localhost:8000", "user"],
    ["http://127.0.0.1:8004", "chat"],
  ]) {
    const backend = createHttpServer((req, res) => {
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({
        service, path: req.url,
        authorization: req.headers.authorization,
        correlationId: req.headers["x-correlation-id"],
      }));
    });
    if (service === "chat") {
      backend.on("upgrade", (req, socket) => {
        websocketRequest = {
          path: req.url, origin: req.headers.origin,
          correlationId: req.headers["x-correlation-id"] as string | undefined,
        };
        const accept = createHash("sha1")
          .update(`${req.headers["sec-websocket-key"]}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`)
          .digest("base64");
        socket.write("HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\n"
          + `Connection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`);
        let received = Buffer.alloc(0);
        socket.on("data", (chunk: Buffer) => {
          received = Buffer.concat([received, chunk]);
          if (received.length >= clientFrame.length) {
            socket.write(received.equals(clientFrame) ? serverFrame : Buffer.from([0x88, 0]));
          }
        });
        socket.on("error", () => socket.destroy());
        socket.on("end", () => socket.end());
      });
    }
    backends.push(backend);
    await new Promise<void>((resolve) => backend.listen(0, "127.0.0.1", resolve));
    targets.set(target, `http://127.0.0.1:${(backend.address() as AddressInfo).port}`);
  }
  const proxy = Object.fromEntries(Object.entries(viteConfig.server!.proxy!).map(([prefix, options]) => {
    const target = typeof options === "string" ? options : String(options.target);
    return [prefix, { ...(typeof options === "string" ? {} : options), target: targets.get(target) ?? target }];
  }));
  vite = await createServer({
    ...viteConfig, configFile: false, logLevel: "silent",
    server: { host: "127.0.0.1", port: 0, hmr: false, proxy },
  });
  await vite.listen();
  baseUrl = vite.resolvedUrls!.local[0];
});

afterAll(async () => {
  await vite?.close();
  await Promise.all(backends.map((backend) => new Promise<void>((resolve) => backend.close(() => resolve()))));
});

it("preserves Chat query strings, bearer authentication and correlation headers", async () => {
  const path = "/v1/chat/users?username=ali&limit=1";
  const response = await fetch(new URL(path, baseUrl), {
    headers: { Authorization: "Bearer proxy-test-only", "X-Correlation-ID": "chat-proxy-test" },
  });
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({
    service: "chat", path,
    authorization: "Bearer proxy-test-only", correlationId: "chat-proxy-test",
  });
});

it.each([
  ["/v1/chat", "chat"],
  ["/v1/chat/conversations/id/messages?afterSequence=3", "chat"],
  ["/v1/chat-other", "user"],
  ["/v1/chatty", "user"],
  ["/v1/users/me", "user"],
])("routes %s to %s", async (path, service) => {
  const response = await fetch(new URL(path, baseUrl));
  expect(await response.json()).toEqual({ service, path });
});

it("tunnels WebSocket frames in both directions and preserves the browser Origin", async () => {
  const result = await new Promise<{ status?: number; frame: Buffer }>((resolve, reject) => {
    const req = request(new URL("/v1/chat/ws", baseUrl), {
      headers: {
        Connection: "Upgrade", Upgrade: "websocket", "Sec-WebSocket-Version": "13",
        "Sec-WebSocket-Key": Buffer.alloc(16, 1).toString("base64"),
        Origin: "http://localhost:5173", "X-Correlation-ID": "chat-ws-proxy-test",
      },
    });
    const timer = setTimeout(() => req.destroy(new Error("WebSocket proxy timed out")), 4000);
    req.on("error", (error) => { clearTimeout(timer); reject(error); });
    req.on("response", (res) => {
      clearTimeout(timer); res.resume(); reject(new Error(`Upgrade returned ${res.statusCode}`));
    });
    req.on("upgrade", (res, socket, head) => {
      let received = head;
      const inspect = () => {
        if (received.length < serverFrame.length) return;
        clearTimeout(timer); socket.destroy(); resolve({ status: res.statusCode, frame: received });
      };
      socket.on("data", (chunk: Buffer) => { received = Buffer.concat([received, chunk]); inspect(); });
      socket.on("error", (error) => { clearTimeout(timer); reject(error); });
      socket.write(clientFrame);
      inspect();
    });
    req.end();
  });
  expect(result.status).toBe(101);
  expect(result.frame).toEqual(serverFrame);
  expect(websocketRequest).toEqual({
    path: "/v1/chat/ws", origin: "http://localhost:5173", correlationId: "chat-ws-proxy-test",
  });
});
