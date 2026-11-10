/* AI Assistance Disclosure: OpenAI Codex (GPT-6), 2026-11-09.
 * Scope: History HTTP (#58), own-balance (#65), and verifier failure/timeout tests.
 * Author review: Reviewed and approved by @phuc. */
import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import { after, before, describe, it } from "node:test";
import type { AddressInfo } from "node:net";
import type { Pool } from "pg";
import { createHttpApp } from "../src/http";
import { HttpSessionVerifier, VerificationContractError, VerificationUnavailable } from "../src/sessionVerifier";

const id = "11111111-1111-4111-8111-111111111111";
const listen = async (server: Server) => {
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
};
const close = (server: Server) => new Promise<void>((resolve) => server.close(() => resolve()));

describe("live session verification", () => {
  let server: Server;
  let baseUrl: string;
  let status = 200;
  let mode = "valid";
  let received: string | undefined;
  before(async () => {
    server = createServer((req, res) => {
      received = req.headers.authorization;
      assert.equal(req.url, "/auth/verify");
      if (mode === "slow") {
        res.writeHead(200, { "content-type": "application/json" });
        res.write('{"id":');
        return;
      }
      res.writeHead(status, { "content-type": "application/json" });
      res.end(mode === "json" ? "bad json" : JSON.stringify(mode === "invalid" ? { id: "forged", role: "MEMBER" } : { id, role: "ADMINISTRATOR" }));
    });
    baseUrl = await listen(server);
  });
  after(async () => { server.closeAllConnections(); await close(server); });
  it("forwards authorization unchanged and validates live identity", async () => {
    const verifier = new HttpSessionVerifier({ baseUrl, timeoutMs: 1000 });
    assert.equal(await verifier.verify(undefined), null);
    assert.equal(await verifier.verify("junk"), null);
    assert.deepEqual(await verifier.verify("Bearer real-token"), { id, role: "ADMINISTRATOR" });
    assert.equal(received, "Bearer real-token");
  });
  it("maps expired/inactive sessions to null, outages to 503 and malformed replies to 500", async () => {
    const verifier = new HttpSessionVerifier({ baseUrl, timeoutMs: 1000 });
    status = 401;
    assert.equal(await verifier.verify("Bearer token"), null);
    status = 503;
    await assert.rejects(verifier.verify("Bearer token"), VerificationUnavailable);
    status = 403;
    await assert.rejects(verifier.verify("Bearer token"), VerificationContractError);
    status = 200;
    for (mode of ["invalid", "json"]) await assert.rejects(verifier.verify("Bearer token"), VerificationContractError);
    mode = "valid";
  });
  it("bounds a stalled response body as well as a network failure", async () => {
    mode = "slow";
    await assert.rejects(new HttpSessionVerifier({ baseUrl, timeoutMs: 30 }).verify("Bearer token"), VerificationUnavailable);
    mode = "valid";
    const brokenFetch: typeof fetch = async () => { throw new TypeError("offline"); };
    await assert.rejects(new HttpSessionVerifier({ baseUrl, timeoutMs: 1000 }, brokenFetch).verify("Bearer token"), VerificationUnavailable);
  });
});

describe("history HTTP", () => {
  let server: Server;
  let baseUrl: string;
  const calls: unknown[][] = [];
  let dbError: Error | undefined;
  let missingAccount = false;
  before(async () => {
    const pool = { async query(...args: unknown[]) {
      calls.push(args);
      if (dbError) throw dbError;
      if (String(args[0]).includes("SELECT available_balance")) {
        return { rows: missingAccount ? [] : [{ available_balance: "91", reserved_balance: "14" }] };
      }
      return { rows: [{ total: "0", items: [] }] };
    } } as unknown as Pool;
    const verifier = { async verify(header: string | undefined) {
      if (header === "Bearer outage") throw new VerificationUnavailable();
      if (header === "Bearer malformed") throw new VerificationContractError();
      return header === "Bearer valid" ? { id, role: "ADMINISTRATOR" as const } : null;
    } };
    server = createServer(createHttpApp(pool, verifier));
    baseUrl = await listen(server);
  });
  after(async () => { await close(server); });
  const get = (query = "", token = "valid") => fetch(`${baseUrl}/me/credit/transactions${query}`, { headers: { authorization: `Bearer ${token}` } });
  it("prevents database access for invalid sessions, unavailable verification and bad queries", async () => {
    assert.equal((await get("", "invalid")).status, 401);
    assert.equal((await get("", "outage")).status, 503);
    assert.equal((await get("", "malformed")).status, 500);
    assert.equal((await get("?userId=another")).status, 400);
    assert.equal((await get("?from=bad")).status, 400);
    assert.equal(calls.length, 0);
  });
  it("queries only the verified user's id, serializes a page, and disables caching", async () => {
    const res = await get("?from=2026-11-02T00:00:00%2B08:00&page=2&size=10");
    assert.equal(res.status, 200);
    assert.equal(res.headers.get("cache-control"), "no-store");
    assert.deepEqual(await res.json(), { items: [], totalItems: 0, page: 2, size: 10 });
    assert.deepEqual(calls[0][1], [id, "2026-11-01T16:00:00.000Z", null, 10, 20]);
  });
  it("returns 503 for database outages and does not leak internal errors", async () => {
    dbError = Object.assign(new Error("secret database location"), { code: "ECONNREFUSED" });
    assert.equal((await get()).status, 503);
    dbError = new Error("secret SQL");
    const res = await get();
    assert.equal(res.status, 500);
    assert.doesNotMatch(await res.text(), /secret/);
    dbError = undefined;
    assert.equal((await fetch(`${baseUrl}/unknown`)).status, 404);
  });
  it("returns only the verified user's current balance without caching", async () => {
    const before = calls.length;
    const unauthenticated = await fetch(`${baseUrl}/me/credit`);
    assert.equal(unauthenticated.status, 401);
    assert.equal(calls.length, before);
    const res = await fetch(`${baseUrl}/me/credit`, { headers: { authorization: "Bearer valid" } });
    assert.equal(res.status, 200);
    assert.equal(res.headers.get("cache-control"), "no-store");
    assert.deepEqual(await res.json(), { available: 91, reserved: 14, total: 105 });
    assert.deepEqual(calls.at(-1)![1], [id]);
    assert.equal((await fetch(`${baseUrl}/me/credit?userId=other`, { headers: { authorization: "Bearer valid" } })).status, 400);
  });
  it("reports an account still being created without claiming a zero balance", async () => {
    missingAccount = true;
    try {
      const res = await fetch(`${baseUrl}/me/credit`, { headers: { authorization: "Bearer valid" } });
      assert.equal(res.status, 404);
      assert.equal((await res.json()).error, "CREDIT_ACCOUNT_NOT_READY");
    } finally { missingAccount = false; }
  });
});
