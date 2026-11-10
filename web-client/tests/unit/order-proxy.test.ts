/*
 * AI Assistance Disclosure (hwangjihun):
 * Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-30
 * Scope: Added regression checks for Voice Assist proxy routes.
 * Author review: I validated correctness, and added boundary checks.
 */

// AI Assistance Disclosure:
// Tool: ChatGPT (Codex, model: gpt-6-astra), date: 2026-10-09
// Scope: Implemented tests for Order development/production proxy routes.
// Author review: I validated correctness and added boundary checks where needed.

// @vitest-environment node
import { afterAll, beforeAll, expect, it } from "vitest";
import { createServer, type ViteDevServer } from "vite";
import viteConfig from "../../vite.config";

const backends: ViteDevServer[] = [];
let vite: ViteDevServer | undefined;
let baseUrl: string;

beforeAll(async () => {
  const targets = new Map<string, string>();
  for (const [targetUrl, name] of [
    ["http://localhost:8000", "user"],
    ["http://localhost:8001", "supplier"],
    ["http://localhost:8002", "order"],
    ["http://localhost:8003", "credit"],
    ["http://127.0.0.1:8004", "chat"],
    ["http://localhost:8005", "admin"],
    ["http://localhost:8006", "voice-assist"],
  ] as const) {
    const backend = await createServer({
      configFile: false, logLevel: "silent",
      server: { host: "127.0.0.1", port: 0, hmr: false },
      plugins: [{
        name: `mock-${name}-api`,
        configureServer(server) {
          server.middlewares.use((_request, response) => {
            response.setHeader("Content-Type", "application/json");
            response.end(JSON.stringify({ service: name }));
          });
        },
      }],
    });
    backends.push(backend);
    await backend.listen();
    targets.set(targetUrl, backend.resolvedUrls!.local[0]);
  }
  const proxy = Object.fromEntries(Object.entries(viteConfig.server!.proxy!).map(([prefix, options]) => {
    const target = typeof options === "string" ? options : String(options.target);
    expect(targets.has(target)).toBe(true);
    return [prefix, { ...(typeof options === "string" ? {} : options), target: targets.get(target) }];
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
  await Promise.all(backends.map((backend) => backend.close()));
});

it.each([
  ["/v1/orders", "order"],
  ["/v1/orders?supplierId=id&pageSize=20", "order"],
  ["/v1/orders/mine?relationship=requester", "order"],
  ["/v1/orders/id/history", "order"],
  ["/v1/order-creations/id", "order"],
  ["/v1/admin/orders?requesterId=id", "order"],
  ["/v1/users/me", "user"],
  ["/v1/admin/users?email=test", "user"],
  ["/v1/orders-other", "user"],
  ["/api/v1/suppliers?page_size=6", "supplier"],
  ["/api/v1/admin/suppliers", "supplier"],
  ["/v1/chat/conversations", "chat"],
  ["/v1/chat-other", "user"],
  ["/v1/wallets/me", "credit"],
  ["/v1/wallets/me/transactions?page=1&pageSize=20", "credit"],
  ["/v1/admin/wallets/id", "credit"],
  ["/v1/admin/credit/reservations/id", "credit"],
  ["/v1/admin/credit/analytics?from=2026-10-20&to=2026-10-21", "credit"],
  ["/v1/admin/credit-other", "user"],
  ["/v1/wallets-other", "user"],
  ["/v1/internal/order-reservations/id", "user"],
  ["/v1/admin/disputes", "admin"],
  ["/v1/admin/disputes?status=OPEN&page=1", "admin"],
  ["/v1/admin/disputes/id/transitions", "admin"],
  ["/v1/admin/audit-log?page=1", "admin"],
  ["/v1/voice-assist/status", "voice-assist"],
  ["/v1/voice-assist/errand-drafts", "voice-assist"],
  ["/v1/voice-assist-other", "user"],
  ["/v1/admin/disputes-other", "user"],
  ["/v1/disputes", "admin"],
  ["/v1/disputes?orderId=id", "admin"],
  ["/v1/disputes-other", "user"],
  ["/v1/admin/admins", "user"],
])("routes %s only to %s", async (path, service) => {
  const response = await fetch(new URL(path, baseUrl));
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ service });
});
