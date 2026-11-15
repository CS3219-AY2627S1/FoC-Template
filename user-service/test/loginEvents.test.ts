/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (Claude Sonnet 5.5), date: 2026-11-08
 * Scope: Tests for N2H1a (login events): table rules, permissions, recording in the login route,
 *        the admin list, and the 90-day cleanup.
 * Author review: Reviewed and approved by @t-leongchuan
 * Additional AI assistance: Claude Code (Claude Opus 5.5), date: 2026-11-08
 * Scope: Permission test for roles other than user_app, and status checks that print the response body.
 * Author review of additional changes: Reviewed and approved by @t-leongchuan
 */
import assert from "node:assert/strict";
import { createServer, Server } from "node:http";
import { AddressInfo } from "node:net";
import { after, before, beforeEach, describe, it } from "node:test";
import express from "express";
import { createTestDatabase } from "./helpers";

const PASSWORD = "StrongPassword123";

describe("login events", { skip: !process.env.TEST_DATABASE_URL }, () => {
  let db: Awaited<ReturnType<typeof createTestDatabase>>;
  let appDb: typeof import("../src/db");
  let accounts: typeof import("../src/accounts");
  let status: typeof import("../src/accountStatus");
  let events: typeof import("../src/loginEvents");
  let retention: typeof import("../src/loginEventsRetention");
  let token: typeof import("../src/token");
  let server: Server;
  let base: string;
  let admin: { id: string };
  let member: { id: string; username: string };

  before(async () => {
    db = await createTestDatabase();
    appDb = await import("../src/db.js");
    accounts = await import("../src/accounts.js");
    status = await import("../src/accountStatus.js");
    events = await import("../src/loginEvents.js");
    retention = await import("../src/loginEventsRetention.js");
    token = await import("../src/token.js");
    const { authRouter } = await import("../src/auth.js");
    const { adminLoginEventsRouter } = await import("../src/adminLoginEvents.js");
    const app = express();
    app.use(express.json());
    app.use("/auth", authRouter);
    app.use(adminLoginEventsRouter);
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
    admin = await accounts.createAccount({ username: "admin", email: "admin@u.nus.edu", password: PASSWORD, role: "ADMINISTRATOR" });
    member = await accounts.createAccount({ username: "member", email: "member@u.nus.edu", password: PASSWORD, role: "MEMBER" });
  });

  const login = (identifier: string, password: string, headers: Record<string, string> = {}) =>
    fetch(`${base}/auth/login`, {
      method: "POST", headers: { "content-type": "application/json", ...headers },
      body: JSON.stringify({ identifier, password }),
    });
  // Status check that shows the response body if it fails (e.g. a 500/503 under load)
  const expectStatus = async (res: Response, expected: number) =>
    assert.equal(res.status, expected, `expected ${expected}, got ${res.status}: ${await res.text()}`);
  const rows = async () => (await db.pool.query(
    "SELECT account_id, outcome, reason, host(ip_address) AS ip, user_agent FROM login_events ORDER BY id")).rows;
  const adminGet = (query = "", as: string | null = admin.id) =>
    fetch(`${base}/admin/login-events${query}`, { headers: as ? { authorization: `Bearer ${token.signAccessToken(as)}` } : {} });

  describe("table rules", () => {
    const insert = (outcome: string, reason: string | null, accountId: string | null, ip: string | null = null, ua: string | null = null) =>
      db.pool.query(
        "INSERT INTO login_events (account_id, outcome, reason, ip_address, user_agent) VALUES ($1,$2,$3,$4,$5)",
        [accountId, outcome, reason, ip, ua]);

    it("accepts every valid outcome/reason pair", async () => {
      await insert("SUCCESS", null, member.id);
      await insert("FAILED", "WRONG_PASSWORD", member.id);
      await insert("FAILED", "NO_SUCH_ACCOUNT", null);
      await insert("BLOCKED", "SUSPENDED", member.id);
      await insert("BLOCKED", "CLOSED", member.id);
      await insert("BLOCKED", "NOT_VERIFIED", member.id);
      assert.equal((await rows()).length, 6);
    });

    it("rejects invalid combinations, a missing/extra account, bad IP text and an over-long user agent", async () => {
      await assert.rejects(insert("SUCCESS", "WRONG_PASSWORD", member.id), /check/i);
      await assert.rejects(insert("FAILED", null, member.id), /check/i);
      await assert.rejects(insert("FAILED", "SUSPENDED", member.id), /check/i);
      await assert.rejects(insert("BLOCKED", "WRONG_PASSWORD", member.id), /check/i);
      await assert.rejects(insert("FAILED", "NO_SUCH_ACCOUNT", member.id), /check/i);
      await assert.rejects(insert("FAILED", "WRONG_PASSWORD", null), /check/i);
      await assert.rejects(insert("SUCCESS", null, null), /check/i);
      await assert.rejects(insert("BLOCKED", null, member.id), /check/i);
      await assert.rejects(insert("SUCCESS", null, member.id, "not-an-ip"), /inet/i);
      await assert.rejects(insert("SUCCESS", null, member.id, null, "x".repeat(501)), /check/i);
      await insert("SUCCESS", null, member.id, null, "x".repeat(500));
    });

    it("the app role can insert and read but not update or delete; it can only run the cleanup function", async () => {
      const c = await db.pool.connect();
      try {
        await c.query("SET ROLE user_app");
        await c.query("INSERT INTO login_events (account_id, outcome) VALUES ($1, 'SUCCESS')", [member.id]);
        assert.equal((await c.query("SELECT * FROM login_events")).rowCount, 1);
        await assert.rejects(c.query("UPDATE login_events SET outcome = 'FAILED'"), /permission denied/);
        await assert.rejects(c.query("DELETE FROM login_events"), /permission denied/);
        await assert.rejects(c.query("TRUNCATE login_events"), /permission denied/);
        await c.query("INSERT INTO login_events (account_id, outcome, occurred_at) VALUES ($1, 'SUCCESS', now() - interval '91 days')", [member.id]);
        const removed = await c.query("SELECT purge_old_login_events() AS removed");
        assert.equal(Number(removed.rows[0].removed), 1);
      } finally { await c.query("RESET ROLE"); c.release(); }
      assert.equal((await rows()).length, 1);
    });

    it("roles other than user_app cannot run the cleanup function or read the table", async () => {
      await db.pool.query("DO $$ BEGIN CREATE ROLE login_events_outsider NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$");
      const c = await db.pool.connect();
      try {
        await c.query("SET ROLE login_events_outsider");
        await assert.rejects(c.query("SELECT purge_old_login_events()"), /permission denied/);
        await assert.rejects(c.query("SELECT * FROM login_events"), /permission denied/);
      } finally { await c.query("RESET ROLE"); c.release(); }
    });
  });

  describe("cleaning client details", () => {
    it("accepts IPv4/IPv6 and rejects anything else", () => {
      assert.equal(events.cleanIp("203.0.113.7"), "203.0.113.7");
      assert.equal(events.cleanIp("::ffff:203.0.113.7"), "::ffff:203.0.113.7");
      assert.equal(events.cleanIp("2001:db8::1"), "2001:db8::1");
      for (const bad of ["", undefined, null, "unknown", "999.1.1.1", "fe80::1%eth0", "1.2.3.4, 5.6.7.8"]) {
        assert.equal(events.cleanIp(bad as string | undefined), null, String(bad));
      }
    });
    it("cuts the user agent to 500 characters, keeps shorter ones, and maps empty to null", () => {
      assert.equal(events.cleanUserAgent("x".repeat(600))?.length, 500);
      assert.equal(events.cleanUserAgent("Mozilla/5.0"), "Mozilla/5.0");
      assert.equal(events.cleanUserAgent("a\u0000b"), "ab");
      assert.equal(events.cleanUserAgent(""), null);
      assert.equal(events.cleanUserAgent(undefined), null);
      const emoji = events.cleanUserAgent("😀".repeat(600));
      assert.equal(Array.from(emoji!).length, 500);
    });
  });

  describe("POST /auth/login records every attempt", () => {
    it("success: SUCCESS with no reason, account, IP and user agent", async () => {
      const res = await login("member", PASSWORD, { "user-agent": "TestBrowser/1.0" });
      assert.equal(res.status, 200);
      const [row] = await rows();
      assert.deepEqual({ ...row, ip: undefined }, { account_id: member.id, outcome: "SUCCESS", reason: null, ip: undefined, user_agent: "TestBrowser/1.0" });
      assert.match(row.ip, /^(127\.0\.0\.1|::1|::ffff:127\.0\.0\.1)$/);
    });

    it("wrong password (by username or email) is FAILED / WRONG_PASSWORD with the account", async () => {
      assert.equal((await login("member", "wrong-password-1")).status, 401);
      assert.equal((await login("member@u.nus.edu", "wrong-password-2")).status, 401);
      const all = await rows();
      assert.equal(all.length, 2);
      for (const r of all) assert.deepEqual([r.account_id, r.outcome, r.reason], [member.id, "FAILED", "WRONG_PASSWORD"]);
    });

    it("unknown username is FAILED / NO_SUCH_ACCOUNT with no account, and the typed text is stored nowhere", async () => {
      const typed = "hunter2-typed-by-mistake";
      assert.equal((await login(typed, "another-secret-typed")).status, 401);
      const [row] = await rows();
      assert.deepEqual([row.account_id, row.outcome, row.reason], [null, "FAILED", "NO_SUCH_ACCOUNT"]);
      const dump = JSON.stringify((await db.pool.query("SELECT * FROM login_events")).rows);
      assert.ok(!dump.includes(typed) && !dump.includes("another-secret-typed"));
    });

    it("suspended account: wrong password is FAILED, correct password is BLOCKED / SUSPENDED (403)", async () => {
      await status.changeAccountStatus("suspend", admin.id, member.id, "test");
      assert.equal((await login("member", "wrong-password-1")).status, 401);
      const res = await login("member", PASSWORD);
      assert.equal(res.status, 403);
      assert.equal((await res.json() as { error: string }).error, "ACCOUNT_SUSPENDED");
      const all = await rows();
      assert.deepEqual(all.map((r) => [r.outcome, r.reason]), [["FAILED", "WRONG_PASSWORD"], ["BLOCKED", "SUSPENDED"]]);
    });

    it("closed account: user sees the generic 401, the log says BLOCKED / CLOSED", async () => {
      await db.pool.query("UPDATE users SET status = 'CLOSED' WHERE id = $1", [member.id]);
      const res = await login("member", PASSWORD);
      assert.equal(res.status, 401);
      assert.equal((await res.json() as { error: string }).error, "INVALID_CREDENTIALS");
      const [row] = await rows();
      assert.deepEqual([row.account_id, row.outcome, row.reason], [member.id, "BLOCKED", "CLOSED"]);
    });

    it("unverified account: BLOCKED / NOT_VERIFIED (403)", async () => {
      await db.pool.query("UPDATE users SET status = 'PENDING_VERIFICATION' WHERE id = $1", [member.id]);
      assert.equal((await login("member", PASSWORD)).status, 403);
      const [row] = await rows();
      assert.deepEqual([row.outcome, row.reason], ["BLOCKED", "NOT_VERIFIED"]);
    });

    it("a request without the required fields is rejected and not recorded", async () => {
      const res = await fetch(`${base}/auth/login`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
      assert.equal(res.status, 400);
      assert.equal((await rows()).length, 0);
    });

    it("stores a long user agent cut to 500 characters, and the login still works", async () => {
      assert.equal((await login("member", PASSWORD, { "user-agent": "y".repeat(2000) })).status, 200);
      assert.equal((await rows())[0].user_agent.length, 500);
    });

    const breakInserts = (outcome: string) => db.pool.query(`
      CREATE FUNCTION fail_login_event() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN RAISE EXCEPTION 'login event write failed'; END $$;
      CREATE TRIGGER fail_login_event BEFORE INSERT ON login_events FOR EACH ROW
        WHEN (NEW.outcome = '${outcome}') EXECUTE FUNCTION fail_login_event()`);
    const repair = () => db.pool.query("DROP TRIGGER IF EXISTS fail_login_event ON login_events; DROP FUNCTION IF EXISTS fail_login_event()");

    it("if a SUCCESS cannot be recorded, the login is refused with 503 and no token", async () => {
      await breakInserts("SUCCESS");
      try {
        const res = await login("member", PASSWORD);
        const body = await res.clone().json() as Record<string, unknown>;
        await expectStatus(res, 503);
        assert.equal(body.error, "SERVICE_UNAVAILABLE");
        assert.equal(body.accessToken, undefined);
      } finally { await repair(); }
      assert.equal((await rows()).length, 0);
    });

    it("if a FAILED or BLOCKED cannot be recorded, the user is still rejected exactly as before", async () => {
      await breakInserts("FAILED");
      try { await expectStatus(await login("member", "wrong-password-1"), 401); } finally { await repair(); }
      await status.changeAccountStatus("suspend", admin.id, member.id, "test");
      await breakInserts("BLOCKED");
      try { await expectStatus(await login("member", PASSWORD), 403); } finally { await repair(); }
    });
  });

  describe("GET /admin/login-events", () => {
    const seed = async (n: number) => {
      for (let i = 0; i < n; i++) {
        await db.pool.query("INSERT INTO login_events (account_id, outcome, reason) VALUES ($1, 'FAILED', 'WRONG_PASSWORD')", [member.id]);
      }
    };
    const json = async (res: Response) => (await res.json()) as { events: any[]; nextCursor: string | null; details?: any };

    it("requires a token and the administrator role", async () => {
      assert.equal((await adminGet("", null)).status, 401);
      assert.equal((await adminGet("", member.id)).status, 403);
      assert.equal((await adminGet("")).status, 200);
    });

    it("lists newest first with the account's username, and includes unknown-username attempts", async () => {
      await login("member", PASSWORD, { "user-agent": "UA-1" });
      await login("nobody-here", "whatever-typed");
      await login("member", "wrong-password-1");
      const { events: list, nextCursor } = await json(await adminGet());
      assert.equal(nextCursor, null);
      assert.deepEqual(list.map((e) => [e.outcome, e.reason, e.account?.username ?? null]),
        [["FAILED", "WRONG_PASSWORD", "member"], ["FAILED", "NO_SUCH_ACCOUNT", null], ["SUCCESS", null, "member"]]);
      assert.equal(list[2].userAgent, "UA-1");
      assert.ok(Number(list[0].id) > Number(list[1].id));
      assert.ok(Date.parse(list[0].occurredAt) > 0);
    });

    it("filters by account (which drops no-account rows), outcome and reason", async () => {
      await login("member", PASSWORD);
      await login("nobody-here", "x-typed-secret");
      await login("member", "wrong-password-1");
      const byAccount = await json(await adminGet(`?accountId=${member.id}`));
      assert.equal(byAccount.events.length, 2);
      assert.ok(byAccount.events.every((e) => e.account.id === member.id));
      assert.equal((await json(await adminGet("?outcome=SUCCESS"))).events.length, 1);
      assert.equal((await json(await adminGet("?reason=NO_SUCH_ACCOUNT"))).events.length, 1);
      assert.equal((await json(await adminGet(`?accountId=${member.id}&reason=NO_SUCH_ACCOUNT`))).events.length, 0);
    });

    it("pages with a cursor: default 50, custom limit, and 'before' continues where the last page ended", async () => {
      await seed(120);
      const first = await json(await adminGet());
      assert.equal(first.events.length, 50);
      assert.ok(first.nextCursor);
      const second = await json(await adminGet(`?before=${first.nextCursor}`));
      assert.equal(second.events.length, 50);
      assert.ok(Number(second.events[0].id) < Number(first.events[49].id));
      const third = await json(await adminGet(`?before=${second.nextCursor}`));
      assert.equal(third.events.length, 20);
      assert.equal(third.nextCursor, null);
      const ids = [...first.events, ...second.events, ...third.events].map((e) => e.id);
      assert.equal(new Set(ids).size, 120);
      const big = await json(await adminGet("?limit=100"));
      assert.equal(big.events.length, 100);
      assert.ok(big.nextCursor);
      assert.equal((await json(await adminGet("?limit=3"))).events.length, 3);
    });

    it("rejects bad parameters with 400 and per-field details", async () => {
      for (const q of ["?limit=101", "?limit=0", "?limit=abc", "?outcome=NOPE", "?reason=NOPE", "?accountId=not-a-uuid", "?before=-5", "?before=abc"]) {
        const res = await adminGet(q);
        assert.equal(res.status, 400, q);
        assert.equal((await res.json() as { error: string }).error, "VALIDATION_FAILED");
      }
    });
  });

  describe("90-day cleanup", () => {
    it("deletes only rows older than 90 days, and is safe to run again or concurrently", async () => {
      const add = (age: string) => db.pool.query(
        `INSERT INTO login_events (account_id, outcome, occurred_at) VALUES ($1, 'SUCCESS', now() - interval '${age}')`, [member.id]);
      await add("91 days"); await add("120 days"); await add("89 days"); await add("1 hour");
      const job = retention.startLoginEventsCleanup(appDb.pool, 60_000);
      try {
        await Promise.all([job.runOnce(), job.runOnce()]);
        await job.runOnce();
      } finally { await job.stop(); }
      assert.equal((await rows()).length, 2);
    });

    it("runs once when started", async () => {
      await db.pool.query("INSERT INTO login_events (account_id, outcome, occurred_at) VALUES ($1, 'SUCCESS', now() - interval '100 days')", [member.id]);
      const job = retention.startLoginEventsCleanup(appDb.pool, 60_000);
      await job.stop(); // waits for the startup run
      assert.equal((await rows()).length, 0);
    });

    it("a failing cleanup is logged, not thrown, and the timer keeps going", async () => {
      const broken = { query: async () => { throw new Error("db down"); } } as unknown as import("pg").Pool;
      const job = retention.startLoginEventsCleanup(broken, 60_000);
      await job.runOnce();
      await job.stop();
    });
  });
});
