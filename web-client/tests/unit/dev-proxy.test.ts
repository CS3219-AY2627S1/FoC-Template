/*
 * AI Assistance Disclosure (hwangjihun):
 * Tool: ChatGPT (Codex, model: gpt-6.1-sol), date: 2026-10-07
 * Scope: Generated regression checks for Supplier development proxy requests.
 * Author review: I validated correctness, and added boundary checks.
 */

// @vitest-environment node
import { afterAll, beforeAll, expect, it } from "vitest";
import { createServer, type ViteDevServer } from "vite";
import viteConfig from "../../vite.config";

let backend: ViteDevServer | undefined;
let vite: ViteDevServer | undefined;
let baseUrl: string;

beforeAll(async () => {
  backend = await createServer({
    configFile: false,
    logLevel: "silent",
    server: { host: "127.0.0.1", port: 0, hmr: false },
    plugins: [{
      name: "mock-supplier-api",
      configureServer(server) {
        server.middlewares.use((_request, response) => {
          response.setHeader("Content-Type", "application/json");
          response.end(JSON.stringify({ service: "supplier" }));
        });
      },
    }],
  });
  await backend.listen();
  const target = backend.resolvedUrls!.local[0];
  const proxy = Object.fromEntries(Object.entries(viteConfig.server!.proxy!).map(([prefix, options]) => [
    prefix, typeof options === "string" ? { target } : { ...options, target },
  ]));
  vite = await createServer({
    ...viteConfig,
    configFile: false,
    logLevel: "silent",
    server: { ...viteConfig.server, host: "127.0.0.1", port: 0, hmr: false, proxy },
  });
  await vite.listen();
  baseUrl = vite.resolvedUrls!.local[0];
});

afterAll(async () => {
  await vite?.close();
  await backend?.close();
});

it.each([
  "/api/v1/categories",
  "/api/v1/suppliers?sort=asc&page=1&page_size=6",
  "/api/v1/suppliers?q=cafe&category=FOOD&category=COFFEE&page_size=50",
  "/api/v1/admin/suppliers?status=INACTIVE&page=2&page_size=20",
  "/api/v1/admin/suppliers/supplier-id",
])("forwards %s to the Supplier API", async (path) => {
  const response = await fetch(new URL(path, baseUrl), {
    headers: { Accept: "application/json" },
  });
  expect(response.status).toBe(200);
  expect(response.headers.get("content-type")).toContain("application/json");
  expect(await response.json()).toEqual({ service: "supplier" });
});
