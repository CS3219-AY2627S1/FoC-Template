/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (Claude Opus 5.5), date: 2026-11-10
 * Scope: Tests for the admin accounts list/lookup and the audit viewer's previousHash
 *        (N2H1 admin pages).
 * Author review: Reviewed and approved by @t-leongchuan
 */
import assert from "node:assert/strict";
import { createServer, Server } from "node:http";
import { AddressInfo } from "node:net";
import { after, before, beforeEach, describe, it } from "node:test";
import express from "express";
import { createTestDatabase } from "./helpers";

const PASSWORD = "StrongPassword123";

describe("admin accounts", { skip: !process.env.TEST_DATABASE_URL }, () => {
  let db: Awaited<ReturnType<typeof createTestDatabase>>;
  let appDb: typeof import("../src/db");
  let accounts: typeof import("../src/accounts");
  let status: typeof import("../src/accountStatus");
  let roles: typeof import("../src/roles");
  let events: typeof import("../src/loginEvents");
  let token: typeof import("../src/token");
  let server: Server;
  let base: string;
  let admin: { id: string };
  let alice: { id: string };
  let bob: { id: string };

  before(async () => {
    db = await createTestDatabase();
    appDb = await import("../src/db.js");
    accounts = await import("../src/accounts.js");
    status = await import("../src/accountStatus.js");
    roles = await import("../src/roles.js");
    events = await import("../src/loginEvents.js");
    token = await import("../src/token.js");
    const { adminAccountsRouter } = await import("../src/adminAccounts.js");
    const { adminAuditRouter } = await import("../src/adminAudit.js");
    const app = express();
    app.use(express.json());
    app.use(adminAccountsRouter);
    app.use(adminAuditRouter);
    server = createServer(app);
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  after(async () => {
    server?.close();
    if (db) { await appDb?.pool.end(); await db.pool.end(); await db.drop(); }
  });
  beforeEach(async () => {
    await db.pool.query("TRUNCATE login_events, outbox, audit_log, users RESTART IDENTITY CASCADE");
    admin = await accounts.createAccount({ username: "root_admin", email: "root@u.nus.edu", password: PASSWORD, role: "ADMINISTRATOR" });
    alice = await accounts.createAccount({ username: "alice_tan", email: "alice@u.nus.edu", password: PASSWORD, role: "MEMBER" });
    bob = await accounts.createAccount({ username: "bob_lim", email: "bob.lim@u.nus.edu", password: PASSWORD, role: "MEMBER" });
    // Distinct, known creation times: admin oldest, bob newest
    await db.pool.query("UPDATE users SET created_at = now() - interval '3 days' WHERE id = $1", [admin.id]);
    await db.pool.query("UPDATE users SET created_at = now() - interval '2 days' WHERE id = $1", [alice.id]);
    await db.pool.query("UPDATE users SET created_at = now() - interval '1 day' WHERE id = $1", [bob.id]);
    await db.pool.query("UPDATE users SET display_name = 'Alice Tan' WHERE id = $1", [alice.id]);
  });

  const get = (path: string, as: string | null = admin.id) =>
    fetch(`${base}${path}`, { headers: as ? { authorization: `Bearer ${token.signAccessToken(as)}` } : {} });
  async function expectStatus(res: Response, expected: number) {
    const body = await res.json().catch(() => null);
    assert.equal(res.status, expected, `expected ${expected}, got ${res.status}: ${JSON.stringify(body)}`);
    return body;
  }
  const usernames = (body: { accounts: { username: string }[] }) => body.accounts.map((a) => a.username);

  describe("GET /admin/accounts", () => {
    it("needs an administrator", async () => {
      await expectStatus(await get("/admin/accounts", null), 401);
      await expectStatus(await get("/admin/accounts", alice.id), 403);
    });

    it("lists newest first with every field the pages show", async () => {
      const body = await expectStatus(await get("/admin/accounts"), 200);
      assert.deepEqual(usernames(body), ["bob_lim", "alice_tan", "root_admin"]);
      assert.equal(body.nextCursor, null);
      const a = body.accounts[1];
      assert.deepEqual(Object.keys(a).sort(), ["createdAt", "displayName", "email", "id", "lastLoginAt", "role", "status", "username"]);
      assert.equal(a.id, alice.id);
      assert.equal(a.displayName, "Alice Tan");
      assert.equal(a.email, "alice@u.nus.edu");
      assert.equal(a.role, "MEMBER");
      assert.equal(a.status, "ACTIVE");
      assert.ok(!Number.isNaN(Date.parse(a.createdAt)));
      assert.equal(a.lastLoginAt, null);
      assert.ok(!("passwordHash" in a) && !("password_hash" in a));
    });

    it("last login is the newest SUCCESS only", async () => {
      await events.recordLoginEvent({ accountId: alice.id, outcome: "SUCCESS", reason: null, ip: null, userAgent: null });
      await db.pool.query("UPDATE login_events SET occurred_at = '2026-11-01T02:00:00Z'");
      await events.recordLoginEvent({ accountId: alice.id, outcome: "FAILED", reason: "WRONG_PASSWORD", ip: null, userAgent: null });
      const body = await expectStatus(await get("/admin/accounts"), 200);
      assert.equal(body.accounts[1].lastLoginAt, "2026-11-01T02:00:00.000Z");
      assert.equal(body.accounts[0].lastLoginAt, null);
    });

    it("searches part of the username, email or display name, ignoring case", async () => {
      assert.deepEqual(usernames(await expectStatus(await get("/admin/accounts?search=TAN"), 200)), ["alice_tan"]);
      assert.deepEqual(usernames(await expectStatus(await get("/admin/accounts?search=bob.lim%40u"), 200)), ["bob_lim"]);
      assert.deepEqual(usernames(await expectStatus(await get("/admin/accounts?search=alice%20t"), 200)), ["alice_tan"]);
      assert.deepEqual(usernames(await expectStatus(await get("/admin/accounts?search=%20%20"), 200)).length, 3, "blank = no search");
    });

    it("treats % and _ in the search as plain characters", async () => {
      assert.deepEqual(usernames(await expectStatus(await get("/admin/accounts?search=%25"), 200)), []);
      // As a wildcard, "b_b" would match "bob"
      assert.deepEqual(usernames(await expectStatus(await get("/admin/accounts?search=b_b"), 200)), []);
      assert.deepEqual(usernames(await expectStatus(await get("/admin/accounts?search=e_t"), 200)), ["alice_tan"]);
    });

    it("filters by status and role", async () => {
      await status.changeAccountStatus("suspend", admin.id, bob.id, "test");
      assert.deepEqual(usernames(await expectStatus(await get("/admin/accounts?status=SUSPENDED"), 200)), ["bob_lim"]);
      assert.deepEqual(usernames(await expectStatus(await get("/admin/accounts?role=ADMINISTRATOR"), 200)), ["root_admin"]);
      assert.deepEqual(usernames(await expectStatus(await get("/admin/accounts?status=ACTIVE&role=MEMBER"), 200)), ["alice_tan"]);
    });

    it("pages with the cursor, also when creation times are equal", async () => {
      await db.pool.query("UPDATE users SET created_at = '2026-11-01T00:00:00Z'"); // all tied
      const seen: string[] = [];
      let cursor: string | null = null;
      do {
        const body = await expectStatus(await get(`/admin/accounts?limit=1${cursor ? `&before=${cursor}` : ""}`), 200);
        assert.equal(body.accounts.length, 1);
        seen.push(body.accounts[0].id);
        cursor = body.nextCursor;
      } while (cursor);
      assert.equal(seen.length, 3);
      assert.equal(new Set(seen).size, 3, "no account repeated or skipped");
    });

    it("rejects bad parameters with the fields named", async () => {
      const body = await expectStatus(await get(`/admin/accounts?status=GONE&role=OWNER&before=x&limit=101&search=${"a".repeat(101)}`), 400);
      assert.equal(body.error, "VALIDATION_FAILED");
      assert.deepEqual(Object.keys(body.details).sort(), ["before", "limit", "role", "search", "status"]);
      await expectStatus(await get("/admin/accounts?limit=0"), 400);
    });
  });

  describe("GET /admin/accounts/:id", () => {
    it("returns one account", async () => {
      const body = await expectStatus(await get(`/admin/accounts/${alice.id}`), 200);
      assert.equal(body.username, "alice_tan");
      assert.equal(body.email, "alice@u.nus.edu");
      assert.ok(body.createdAt);
    });

    it("404 for an unknown or malformed id; needs an administrator", async () => {
      assert.equal((await expectStatus(await get("/admin/accounts/00000000-0000-4000-8000-000000000000"), 404)).error, "USER_NOT_FOUND");
      await expectStatus(await get("/admin/accounts/not-a-uuid"), 404);
      await expectStatus(await get(`/admin/accounts/${alice.id}`, alice.id), 403);
    });
  });

  describe("GET /admin/audit previousHash", () => {
    it("each entry links to the hash of the entry before it", async () => {
      await status.changeAccountStatus("suspend", admin.id, bob.id, "spam");
      await status.changeAccountStatus("restore", admin.id, bob.id, "appeal ok");
      await roles.changeRole(admin.id, alice.id, "ADMINISTRATOR", null);
      const body = await expectStatus(await get("/admin/audit"), 200);
      const entries = body.entries as { previousHash: string; hash: string }[];
      assert.equal(entries.length, 3);
      for (let i = 0; i < entries.length - 1; i++) assert.equal(entries[i].previousHash, entries[i + 1].hash);
      assert.match(entries[2].previousHash, /^[0-9a-f]+$/);
    });
  });
});
