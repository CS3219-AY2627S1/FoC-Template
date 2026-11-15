/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (Claude Opus 5.5), date: 2026-11-10
 * Scope: Tests for account reviews (N2H1b) and the profile fields of /whoami.
 * Author review: Reviewed and approved by @t-leongchuan
 */
import assert from "node:assert/strict";
import { createServer, Server } from "node:http";
import { AddressInfo } from "node:net";
import { after, before, beforeEach, describe, it } from "node:test";
import express from "express";
import { createTestDatabase } from "./helpers";

const PASSWORD = "StrongPassword123";

describe("account reviews", { skip: !process.env.TEST_DATABASE_URL }, () => {
  let db: Awaited<ReturnType<typeof createTestDatabase>>;
  let appDb: typeof import("../src/db");
  let accounts: typeof import("../src/accounts");
  let status: typeof import("../src/accountStatus");
  let events: typeof import("../src/loginEvents");
  let audit: typeof import("../src/audit");
  let token: typeof import("../src/token");
  let server: Server;
  let base: string;
  let admin: { id: string };
  let admin2: { id: string };
  let alice: { id: string };

  before(async () => {
    db = await createTestDatabase();
    appDb = await import("../src/db.js");
    accounts = await import("../src/accounts.js");
    status = await import("../src/accountStatus.js");
    events = await import("../src/loginEvents.js");
    audit = await import("../src/audit.js");
    token = await import("../src/token.js");
    const { accountReviewsRouter } = await import("../src/accountReviews.js");
    const { profileRouter } = await import("../src/profile.js");
    const app = express();
    app.use(express.json());
    app.use(accountReviewsRouter);
    app.use(profileRouter);
    server = createServer(app);
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  after(async () => {
    server?.close();
    if (db) { await appDb?.pool.end(); await db.pool.end(); await db.drop(); }
  });
  beforeEach(async () => {
    await db.pool.query("TRUNCATE account_reviews, login_events, outbox, audit_log, users RESTART IDENTITY CASCADE");
    admin = await accounts.createAccount({ username: "root_admin", email: "root@u.nus.edu", password: PASSWORD, role: "ADMINISTRATOR" });
    admin2 = await accounts.createAccount({ username: "second_admin", email: "second@u.nus.edu", password: PASSWORD, role: "ADMINISTRATOR" });
    alice = await accounts.createAccount({ username: "alice_tan", email: "alice@u.nus.edu", password: PASSWORD, role: "MEMBER" });
  });

  const call = (method: string, path: string, body?: unknown, as: string | null = admin.id) =>
    fetch(`${base}${path}`, {
      method,
      headers: { "content-type": "application/json", ...(as ? { authorization: `Bearer ${token.signAccessToken(as)}` } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  async function expectStatus(res: Response, expected: number) {
    const body = await res.json().catch(() => null);
    assert.equal(res.status, expected, `expected ${expected}, got ${res.status}: ${JSON.stringify(body)}`);
    return body;
  }
  const open = async (accountId = alice.id, reason = "Reported password guessing", as = admin.id) =>
    expectStatus(await call("POST", "/admin/reviews", { accountId, reason }, as), 201);
  const accountStatus = async (id: string) => (await db.pool.query("SELECT status FROM users WHERE id = $1", [id])).rows[0].status;
  const auditActions = async () => (await db.pool.query("SELECT action, reason, new_value FROM audit_log ORDER BY id")).rows;

  describe("/whoami profile fields", () => {
    it("GET and PATCH return email and the creation date as well", async () => {
      const me = await expectStatus(await call("GET", "/whoami", undefined, alice.id), 200);
      assert.deepEqual(Object.keys(me).sort(), ["createdAt", "displayName", "email", "role", "username"]);
      assert.equal(me.email, "alice@u.nus.edu");
      assert.ok(!Number.isNaN(Date.parse(me.createdAt)));
      const patched = await expectStatus(await call("PATCH", "/whoami", { displayName: "  Alice Tan " }, alice.id), 200);
      assert.equal(patched.displayName, "Alice Tan");
      assert.equal(patched.email, "alice@u.nus.edu");
      assert.equal(patched.createdAt, me.createdAt);
      assert.equal((await expectStatus(await call("PATCH", "/whoami", {}, alice.id), 200)).email, "alice@u.nus.edu");
      await expectStatus(await call("PATCH", "/whoami", { displayName: "x".repeat(51) }, alice.id), 400);
    });
  });

  describe("opening", () => {
    it("opens with the account's status, and writes REVIEW_OPENED with the reason", async () => {
      const review = await open();
      assert.equal(review.status, "OPEN");
      assert.equal(review.statusAtOpen, "ACTIVE");
      assert.deepEqual(review.allowedOutcomes, ["SUSPEND", "NO_ACTION"]);
      assert.equal(review.account.username, "alice_tan");
      assert.equal(review.openedBy.username, "root_admin");
      assert.equal(review.openReason, "Reported password guessing");
      assert.equal(review.outcome, null);
      assert.deepEqual(await auditActions(), [{ action: "REVIEW_OPENED", reason: "Reported password guessing", new_value: `OPEN #${review.id}` }]);
    });

    it("needs an administrator and a reason of 1-500 characters", async () => {
      await expectStatus(await call("POST", "/admin/reviews", { accountId: alice.id, reason: "x" }, null), 401);
      await expectStatus(await call("POST", "/admin/reviews", { accountId: admin.id, reason: "x" }, alice.id), 403);
      const body = await expectStatus(await call("POST", "/admin/reviews", { accountId: "nope", reason: "  " }), 400);
      assert.deepEqual(Object.keys(body.details).sort(), ["accountId", "reason"]);
      await expectStatus(await call("POST", "/admin/reviews", { accountId: alice.id, reason: "x".repeat(501) }), 400);
    });

    it("one open review per account; your own account and unknown or inactive accounts are refused", async () => {
      const first = await open();
      const again = await expectStatus(await call("POST", "/admin/reviews", { accountId: alice.id, reason: "again" }, admin2.id), 409);
      assert.equal(again.error, "REVIEW_ALREADY_OPEN");
      assert.equal(again.reviewId, first.id);
      assert.equal((await expectStatus(await call("POST", "/admin/reviews", { accountId: admin.id, reason: "me" }), 403)).error, "CANNOT_REVIEW_SELF");
      assert.equal((await expectStatus(await call("POST", "/admin/reviews", { accountId: "00000000-0000-4000-8000-000000000000", reason: "x" }), 404)).error, "USER_NOT_FOUND");
      await db.pool.query("UPDATE users SET status = 'CLOSED' WHERE id = $1", [admin2.id]);
      assert.equal((await expectStatus(await call("POST", "/admin/reviews", { accountId: admin2.id, reason: "x" }), 409)).error, "INVALID_STATUS_TRANSITION");
    });
  });

  describe("deciding", () => {
    it("SUSPEND on an active account suspends it with the reasoning, saves the evidence and writes both entries", async () => {
      const review = await open();
      const outboxBefore = (await db.pool.query("SELECT count(*)::int AS n FROM outbox WHERE message_key = $1", [alice.id])).rows[0].n;
      // Evidence: 2 failed + 1 blocked this week, 1 failed 30 days ago, 1 failed 100 days ago (not counted)
      for (const [outcome, reason, days] of [["FAILED", "WRONG_PASSWORD", 1], ["FAILED", "WRONG_PASSWORD", 2], ["BLOCKED", "SUSPENDED", 3], ["FAILED", "WRONG_PASSWORD", 30], ["FAILED", "WRONG_PASSWORD", 100], ["SUCCESS", null, 1]] as const) {
        await events.recordLoginEvent({ accountId: alice.id, outcome, reason, ip: null, userAgent: null });
        await db.pool.query("UPDATE login_events SET occurred_at = now() - make_interval(days => $1) WHERE id = (SELECT max(id) FROM login_events)", [days]);
      }
      const decided = await expectStatus(await call("POST", `/admin/reviews/${review.id}/decision`, { outcome: "SUSPEND", reasoning: "Guessing confirmed by the logs" }, admin2.id), 200);
      assert.equal(decided.status, "DECIDED");
      assert.equal(decided.outcome, "SUSPEND");
      assert.equal(decided.closedBy.username, "second_admin");
      assert.equal(decided.reasoning, "Guessing confirmed by the logs");
      assert.deepEqual({ ...decided.evidence, capturedAt: "x" }, {
        capturedAt: "x", failedLoginsLast7Days: 2, blockedLoginsLast7Days: 1, failedLoginsLast90Days: 3, blockedLoginsLast90Days: 1, auditEntriesLast90Days: 1,
      });
      assert.equal(await accountStatus(alice.id), "SUSPENDED");
      assert.equal((await db.pool.query("SELECT count(*)::int AS n FROM outbox WHERE message_key = $1", [alice.id])).rows[0].n, outboxBefore + 1, "one Kafka message for the suspension");
      assert.deepEqual((await auditActions()).map((a) => [a.action, a.reason]), [
        ["REVIEW_OPENED", "Reported password guessing"],
        ["ACCOUNT_SUSPENDED", "Guessing confirmed by the logs"],
        ["REVIEW_DECIDED", "Guessing confirmed by the logs"],
      ]);
      assert.equal((await audit.verifyAuditChain()).valid, true);
    });

    it("REINSTATE restores a suspended account; KEEP_SUSPENDED and NO_ACTION change nothing", async () => {
      await status.changeAccountStatus("suspend", admin.id, alice.id, "spam");
      const r1 = await open();
      assert.deepEqual(r1.allowedOutcomes, ["REINSTATE", "KEEP_SUSPENDED"]);
      await expectStatus(await call("POST", `/admin/reviews/${r1.id}/decision`, { outcome: "KEEP_SUSPENDED", reasoning: "Still guessing" }), 200);
      assert.equal(await accountStatus(alice.id), "SUSPENDED");
      const r2 = await open();
      await expectStatus(await call("POST", `/admin/reviews/${r2.id}/decision`, { outcome: "REINSTATE", reasoning: "Appeal accepted" }), 200);
      assert.equal(await accountStatus(alice.id), "ACTIVE");
      const r3 = await open();
      await expectStatus(await call("POST", `/admin/reviews/${r3.id}/decision`, { outcome: "NO_ACTION", reasoning: "Nothing found" }), 200);
      assert.equal(await accountStatus(alice.id), "ACTIVE");
      assert.deepEqual((await auditActions()).map((a) => a.action), [
        "ACCOUNT_SUSPENDED", "REVIEW_OPENED", "REVIEW_DECIDED", "REVIEW_OPENED", "ACCOUNT_RESTORED", "REVIEW_DECIDED", "REVIEW_OPENED", "REVIEW_DECIDED",
      ]);
    });

    it("refuses an outcome that does not fit the status at opening", async () => {
      const review = await open();
      const body = await expectStatus(await call("POST", `/admin/reviews/${review.id}/decision`, { outcome: "REINSTATE", reasoning: "x" }), 400);
      assert.match(body.details.outcome, /SUSPEND, NO_ACTION/);
      await expectStatus(await call("POST", `/admin/reviews/${review.id}/decision`, { outcome: "SUSPEND", reasoning: "" }), 400);
    });

    it("refuses if the account's status changed after opening, and the review stays open", async () => {
      const review = await open();
      await status.changeAccountStatus("suspend", admin2.id, alice.id, "direct action");
      const body = await expectStatus(await call("POST", `/admin/reviews/${review.id}/decision`, { outcome: "NO_ACTION", reasoning: "x" }), 409);
      assert.equal(body.error, "ACCOUNT_STATUS_CHANGED");
      assert.equal((await expectStatus(await call("GET", `/admin/reviews/${review.id}`), 200)).status, "OPEN");
    });

    it("a closed review cannot be decided or cancelled again", async () => {
      const review = await open();
      await expectStatus(await call("POST", `/admin/reviews/${review.id}/decision`, { outcome: "NO_ACTION", reasoning: "ok" }), 200);
      assert.equal((await expectStatus(await call("POST", `/admin/reviews/${review.id}/decision`, { outcome: "SUSPEND", reasoning: "x" }), 409)).error, "REVIEW_NOT_OPEN");
      assert.equal((await expectStatus(await call("POST", `/admin/reviews/${review.id}/cancel`, { reason: "x" }), 409)).error, "REVIEW_NOT_OPEN");
      assert.equal((await expectStatus(await call("POST", "/admin/reviews/999/decision", { outcome: "SUSPEND", reasoning: "x" }), 404)).error, "REVIEW_NOT_FOUND");
    });
  });

  describe("cancelling, listing and reading", () => {
    it("cancel needs a reason, changes nothing on the account, and frees the account for a new review", async () => {
      const review = await open();
      await expectStatus(await call("POST", `/admin/reviews/${review.id}/cancel`, { reason: "" }), 400);
      const cancelled = await expectStatus(await call("POST", `/admin/reviews/${review.id}/cancel`, { reason: "Opened on the wrong account" }), 200);
      assert.equal(cancelled.status, "CANCELLED");
      assert.equal(cancelled.outcome, null);
      assert.equal(cancelled.evidence, null);
      assert.equal(await accountStatus(alice.id), "ACTIVE");
      await open();
      assert.deepEqual((await auditActions()).map((a) => a.action), ["REVIEW_OPENED", "REVIEW_CANCELLED", "REVIEW_OPENED"]);
    });

    it("lists newest first with account and status filters and a cursor", async () => {
      const r1 = await open();
      await expectStatus(await call("POST", `/admin/reviews/${r1.id}/cancel`, { reason: "mistake" }), 200);
      const r2 = await open(alice.id, "second look");
      const r3 = await open(admin2.id, "admin check");
      const all = await expectStatus(await call("GET", "/admin/reviews"), 200);
      assert.deepEqual(all.reviews.map((r: { id: string }) => r.id), [r3.id, r2.id, r1.id]);
      assert.deepEqual((await expectStatus(await call("GET", `/admin/reviews?accountId=${alice.id}&status=OPEN`), 200)).reviews.map((r: { id: string }) => r.id), [r2.id]);
      const page1 = await expectStatus(await call("GET", "/admin/reviews?limit=2"), 200);
      const page2 = await expectStatus(await call("GET", `/admin/reviews?limit=2&before=${page1.nextCursor}`), 200);
      assert.deepEqual([...page1.reviews, ...page2.reviews].map((r: { id: string }) => r.id), [r3.id, r2.id, r1.id]);
      assert.equal(page2.nextCursor, null);
      const bad = await expectStatus(await call("GET", "/admin/reviews?status=DONE&accountId=x&before=0&limit=101"), 400);
      assert.deepEqual(Object.keys(bad.details).sort(), ["accountId", "before", "limit", "status"]);
      await expectStatus(await call("GET", "/admin/reviews", undefined, alice.id), 403);
    });

    it("an open review shows the numbers as they are now; a decided one only its saved snapshot", async () => {
      const review = await open();
      await events.recordLoginEvent({ accountId: alice.id, outcome: "FAILED", reason: "WRONG_PASSWORD", ip: null, userAgent: null });
      const now = await expectStatus(await call("GET", `/admin/reviews/${review.id}`), 200);
      assert.equal(now.currentEvidence.failedLoginsLast7Days, 1);
      await expectStatus(await call("POST", `/admin/reviews/${review.id}/decision`, { outcome: "NO_ACTION", reasoning: "one typo" }), 200);
      const later = await expectStatus(await call("GET", `/admin/reviews/${review.id}`), 200);
      assert.equal(later.currentEvidence, null);
      assert.equal(later.evidence.failedLoginsLast7Days, 1);
      await expectStatus(await call("GET", "/admin/reviews/abc"), 404);
    });
  });

  describe("database rules", () => {
    it("user_app cannot delete reviews or change who or what was reviewed", async () => {
      const review = await open();
      const client = await db.pool.connect();
      try {
        await client.query("SET ROLE user_app");
        await assert.rejects(client.query("DELETE FROM account_reviews"), /permission denied/);
        await assert.rejects(client.query("UPDATE account_reviews SET account_id = $1", [admin2.id]), /permission denied/);
        await assert.rejects(client.query("UPDATE account_reviews SET open_reason = 'edited'"), /permission denied/);
      } finally {
        await client.query("RESET ROLE");
        client.release();
      }
      assert.equal((await db.pool.query("SELECT open_reason FROM account_reviews WHERE id = $1", [review.id])).rows[0].open_reason, "Reported password guessing");
    });

    it("the table refuses inconsistent rows and a second open review", async () => {
      await open();
      await assert.rejects(db.pool.query(
        "INSERT INTO account_reviews (account_id, status_at_open, opened_by, open_reason) VALUES ($1, 'ACTIVE', $2, 'x')", [alice.id, admin2.id]),
        /account_reviews_one_open/);
      await assert.rejects(db.pool.query(
        "INSERT INTO account_reviews (account_id, status_at_open, opened_by, open_reason, status) VALUES ($1, 'ACTIVE', $2, 'x', 'DECIDED')", [admin2.id, admin.id]),
        /check/i);
      await assert.rejects(db.pool.query(
        `INSERT INTO account_reviews (account_id, status_at_open, opened_by, open_reason, status, closed_by, closed_at, outcome, reasoning, evidence)
         VALUES ($1, 'ACTIVE', $2, 'x', 'DECIDED', $2, now(), 'REINSTATE', 'y', '{}')`, [admin2.id, admin.id]),
        /check/i);
    });
  });
});
