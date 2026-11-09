/* AI Assistance Disclosure: OpenAI Codex (GPT-6), 2026-11-09.
 * Scope: History validation, database isolation and pagination tests for #58.
 * Author review: Reviewed and approved by @phuc. */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, describe, it } from "node:test";
import { Pool } from "pg";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { createHttpApp } from "../src/http";
import { InvalidTransactionQuery, listTransactions, parseTransactionQuery } from "../src/transactions";
import { activeAccount, createTestDatabase, type TestDatabase } from "./helpers";

describe("history query validation", () => {
  it("defaults pagination and converts either bound to UTC", () => {
    assert.deepEqual(parseTransactionQuery(new URLSearchParams()), { from: undefined, to: undefined, page: 0, size: 20 });
    for (const key of ["from", "to"]) {
      assert.equal(parseTransactionQuery(new URLSearchParams({ [key]: "2026-11-02T00:00:00+08:00" }))[key as "from" | "to"], "2026-11-01T16:00:00.000Z");
    }
    assert.equal(parseTransactionQuery(new URLSearchParams({ from: "2024-02-29T00:00:00Z" })).from, "2024-02-29T00:00:00.000Z");
  });
  it("rejects ambiguous dates, invalid calendars, duplicate/unknown fields and unsafe pagination", () => {
    for (const query of [
      "from=2026-11-02", "from=2026-02-29T00:00:00Z", "from=2026-04-31T00:00:00Z",
      "from=2026-00-01T00:00:00Z", "from=2026-01-00T00:00:00Z", "from=2026-01-01T24:00:00Z",
      "from=2026-01-01T00:00:00", "from=", "from=2026-01-01T00:00:60Z",
      "from=2026-01-01T00:00:00%2B24:00", "from=x&from=y", "from[]=x", "userId=someone",
      "page=-1", "page=1.2", "page=1e2", "page=", "size=0", "size=101", "page=1&page=2",
      "page=9007199254740992", "page=9007199254740991&size=2",
      "from=2026-11-03T00:00:00Z&to=2026-11-02T00:00:00Z",
      "from=2026-11-02T00:00:00Z&to=2026-11-02T08:00:00%2B08:00",
    ]) assert.throws(() => parseTransactionQuery(new URLSearchParams(query)), InvalidTransactionQuery, query);
  });
});

describe("history database reads", { skip: !process.env.TEST_DATABASE_URL }, () => {
  let db: TestDatabase;
  let appPool: Pool;
  let user: string;
  const from = "2026-11-01T16:00:00.000Z";
  const to = "2026-11-02T16:00:00.000Z";
  const types = ["INITIAL_GRANT", "RESERVE", "CAPTURE_DEBIT", "CAPTURE_CREDIT", "RELEASE", "FORFEIT"];
  before(async () => {
    db = await createTestDatabase();
    user = await activeAccount(db.pool);
    const other = await activeAccount(db.pool);
    for (const [index, type] of types.entries()) {
      await db.pool.query(`INSERT INTO credit_transactions
        (id, user_id, type, available_delta, reserved_delta, operation_id, created_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [String(9007199254740992n + BigInt(index)), user, type, -index, index, randomUUID(), from]);
    }
    await db.pool.query(`INSERT INTO credit_transactions
      (user_id, type, available_delta, reserved_delta, operation_id, created_at)
      VALUES ($1, 'INITIAL_GRANT', 100, 0, $2, $3), ($4, 'INITIAL_GRANT', 100, 0, $5, $6)`,
    [user, randomUUID(), to, other, randomUUID(), from]);
    appPool = new Pool({ connectionString: db.pool.options.connectionString, options: "-c role=credit_app" });
  });
  after(async () => { await appPool?.end(); await db?.drop(); });

  it("uses credit_app, isolates users, honors boundaries, sorts ties, preserves string ids and both deltas", async () => {
    const page = await listTransactions(appPool, user, { from, to, page: 0, size: 20 });
    assert.equal(page.totalItems, 6);
    assert.deepEqual(page.items.map((item) => item.type), [...types].reverse());
    assert.equal(page.items[0].id, "9007199254740997");
    assert.equal(page.items[0].availableDelta, -5);
    assert.equal(page.items[0].reservedDelta, 5);
    assert.equal(page.items[0].reservationId, null);
    assert.equal(page.items[0].orderId, null);
    assert.equal(page.items[0].createdAt, from);
  });
  it("returns filtered totals on every page, even out of range, and no rows for unknown accounts", async () => {
    const first = await listTransactions(appPool, user, { from, to, page: 0, size: 2 });
    const second = await listTransactions(appPool, user, { from, to, page: 1, size: 2 });
    assert.equal(first.totalItems, 6);
    assert.equal(second.totalItems, 6);
    assert.equal(second.items.length, 2);
    assert.notEqual(first.items[0].id, second.items[0].id);
    assert.deepEqual(await listTransactions(appPool, user, { from, to, page: 5, size: 2 }), { items: [], totalItems: 6, page: 5, size: 2 });
    assert.equal((await listTransactions(appPool, randomUUID(), { page: 0, size: 20 })).totalItems, 0);
    assert.equal((await listTransactions(appPool, user, { to: from, page: 0, size: 20 })).totalItems, 0);
    assert.equal((await listTransactions(appPool, user, { from: to, page: 0, size: 20 })).totalItems, 2);
  });

  it("serves a real database page over HTTP using the verified identity", async () => {
    const app = createHttpApp(appPool, { async verify() { return { id: user, role: "MEMBER" }; } });
    let server!: Server;
    await new Promise<void>((resolve) => { server = app.listen(0, "127.0.0.1", () => resolve()); });
    try {
      const query = new URLSearchParams({ from: "2026-11-02T00:00:00+08:00", to: "2026-11-03T00:00:00+08:00", size: "2" });
      const res = await fetch(`http://127.0.0.1:${(server.address() as AddressInfo).port}/me/credit/transactions?${query}`);
      assert.equal(res.status, 200);
      const page = await res.json();
      assert.equal(page.totalItems, 6);
      assert.equal(page.items.length, 2);
      assert.equal(page.items[0].id, "9007199254740997");
      assert.equal(page.items[0].createdAt, from);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
});
