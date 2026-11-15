// AI assistance: Codex (GPT-6), 2026-10-18. Scope: transactional publishing tests. Author review: Reviewed and approved by @phuc.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, beforeEach, describe, it } from "node:test";
import bcrypt from "bcryptjs";
import { Pool } from "pg";
import { createTestDatabase, waitFor } from "./helpers";
import { deletePublishedOutboxEvents, publishOutboxBatch, recordStatusChange } from "../src/outbox";
import { startOutboxPublisher, StatusProducer } from "../src/publisher";
import { wakePublisher } from "../src/publisherWake";

describe("account-status outbox", { skip: !process.env.TEST_DATABASE_URL }, () => {
  let db: Awaited<ReturnType<typeof createTestDatabase>>;
  let accounts: typeof import("../src/accounts");
  let appDb: typeof import("../src/db");
  let status: typeof import("../src/accountStatus");
  let bootstrap: typeof import("../src/bootstrap");
  before(async () => {
    db = await createTestDatabase();
    accounts = await import("../src/accounts.js");
    appDb = await import("../src/db.js");
    status = await import("../src/accountStatus.js");
    bootstrap = await import("../src/bootstrap.js");
  });
  after(async () => { if (db) { await appDb?.pool.end(); await db.pool.end(); await db.drop(); } });
  beforeEach(async () => { await db.pool.query("TRUNCATE outbox, audit_log, users RESTART IDENTITY CASCADE"); });

  const input = (username: string) => ({ username, email: `${username}@u.nus.edu`, password: "StrongPassword123", role: "MEMBER" as const });
  const queue = (count: number) => appDb.inTransaction(db.pool, async (client) => {
    for (let i = 0; i < count; i++) await recordStatusChange(client, { accountId: randomUUID(), newStatus: "ACTIVE", firstActive: true });
  });

  it("prepares a password without a DB connection, then creates account and activation atomically", async () => {
    const prepared = await accounts.prepareAccount(input("member"));
    assert.equal(appDb.pool.totalCount, 0);
    assert.ok(await bcrypt.compare("StrongPassword123", prepared.passwordHash));
    const account = await appDb.inTransaction(db.pool, (client) => accounts.insertPreparedAccount(prepared, client));
    const { rows: [event] } = await db.pool.query("SELECT * FROM outbox");
    assert.equal(event.message_key, account.id);
    assert.equal(event.topic, "user.account-status");
    assert.deepEqual(event.payload, {
      operation_id: event.event_id, account_id: account.id, new_status: "ACTIVE", first_active: true,
      schema_version: 1, occurred_at: event.payload.occurred_at,
    });
    assert.ok(Number.isFinite(Date.parse(event.payload.occurred_at)));
  });

  it("failed validation or duplicate registration adds no activation", async () => {
    await assert.rejects(accounts.createAccount({ ...input("bad"), password: "weak" }), accounts.ValidationError);
    await accounts.createAccount(input("member"));
    await assert.rejects(accounts.createAccount(input("member")), accounts.ConflictError);
    assert.equal((await db.pool.query("SELECT * FROM outbox")).rowCount, 1);
    assert.equal((await db.pool.query("SELECT * FROM users")).rowCount, 1);
  });

  it("rolls back the account when writing the notification fails", async () => {
    await db.pool.query(`CREATE FUNCTION fail_outbox() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN RAISE EXCEPTION 'outbox write failed'; END $$;
      CREATE TRIGGER fail_outbox BEFORE INSERT ON outbox FOR EACH ROW EXECUTE FUNCTION fail_outbox()`);
    try {
      await assert.rejects(accounts.createAccount(input("member")), /outbox write failed/);
      assert.equal((await db.pool.query("SELECT * FROM users")).rowCount, 0);
    } finally { await db.pool.query("DROP TRIGGER fail_outbox ON outbox; DROP FUNCTION fail_outbox()"); }
  });

  it("suspend and restore emit one notification per change, with no event on repeats", async () => {
    const admin = await accounts.createAccount({ ...input("admin"), role: "ADMINISTRATOR" });
    const member = await accounts.createAccount(input("member"));
    await status.changeAccountStatus("suspend", admin.id, member.id, "test suspension");
    await status.changeAccountStatus("suspend", admin.id, member.id, "test repeat");
    await status.changeAccountStatus("restore", admin.id, member.id, "test restore");
    const { rows } = await db.pool.query("SELECT payload FROM outbox WHERE message_key = $1 ORDER BY id", [member.id]);
    assert.deepEqual(rows.map((r) => [r.payload.new_status, r.payload.first_active]), [["ACTIVE", true], ["SUSPENDED", false], ["ACTIVE", false]]);
    assert.equal((await db.pool.query("SELECT * FROM audit_log")).rowCount, 2);
  });

  it("bootstrap emits initial activation once, together with its audit entry", async () => {
    process.env.BOOTSTRAP_ADMIN_USERNAME = "bootstrap_admin";
    process.env.BOOTSTRAP_ADMIN_EMAIL = "bootstrap_admin@u.nus.edu";
    process.env.BOOTSTRAP_ADMIN_PASSWORD = "StrongPassword123";
    try { await bootstrap.bootstrapFirstAdmin(); await bootstrap.bootstrapFirstAdmin(); }
    finally {
      process.env.BOOTSTRAP_ADMIN_USERNAME = "";
      process.env.BOOTSTRAP_ADMIN_EMAIL = "";
      process.env.BOOTSTRAP_ADMIN_PASSWORD = "";
    }
    assert.equal((await db.pool.query("SELECT * FROM outbox")).rowCount, 1);
    assert.equal((await db.pool.query("SELECT * FROM audit_log")).rowCount, 1);
  });

  it("rolls back status and notification together when the audit insert fails", async () => {
    const admin = await accounts.createAccount({ ...input("admin"), role: "ADMINISTRATOR" });
    const member = await accounts.createAccount(input("member"));
    await db.pool.query(`CREATE FUNCTION fail_audit() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN RAISE EXCEPTION 'audit write failed'; END $$;
      CREATE TRIGGER fail_audit BEFORE INSERT ON audit_log FOR EACH ROW EXECUTE FUNCTION fail_audit()`);
    try {
      await assert.rejects(status.changeAccountStatus("suspend", admin.id, member.id, "test"), /audit write failed/);
      assert.equal((await db.pool.query("SELECT status FROM users WHERE id = $1", [member.id])).rows[0].status, "ACTIVE");
      assert.equal((await db.pool.query("SELECT * FROM outbox WHERE message_key = $1", [member.id])).rowCount, 1);
    } finally { await db.pool.query("DROP TRIGGER fail_audit ON audit_log; DROP FUNCTION fail_audit()"); }
  });

  it("can insert, publish, measure and clean the outbox as the runtime user_app role", async () => {
    const runtime = new Pool({ connectionString: db.pool.options.connectionString, options: "-c role=user_app" });
    try {
      const prepared = await accounts.prepareAccount(input("member"));
      await appDb.inTransaction(runtime, (client) => accounts.insertPreparedAccount(prepared, client));
      assert.equal(await publishOutboxBatch(runtime, async () => {}), 1);
      assert.equal(await deletePublishedOutboxEvents(runtime), 0);
      assert.equal((await runtime.query("SELECT * FROM outbox")).rowCount, 1);
    } finally { await runtime.end(); }
  });

  it("sends up to 100 in order, including partial batches, and retries identical IDs after failure", async () => {
    await queue(103);
    const expected = (await db.pool.query("SELECT payload FROM outbox ORDER BY id")).rows.map((r) => r.payload.operation_id);
    let failed: string[] = [];
    await assert.rejects(publishOutboxBatch(db.pool, async (messages) => {
      failed = messages.map((m) => JSON.parse(m.value).operation_id);
      throw new Error("broker down");
    }), /broker down/);
    assert.equal((await db.pool.query("SELECT * FROM outbox WHERE published_at IS NULL")).rowCount, 103);
    const sent: string[] = [];
    const send = async (messages: { value: string }[]) => { sent.push(...messages.map((m) => JSON.parse(m.value).operation_id)); };
    assert.equal(await publishOutboxBatch(db.pool, send), 100);
    assert.deepEqual(sent, failed);
    assert.equal(await publishOutboxBatch(db.pool, send), 3);
    assert.deepEqual(sent, expected);
  });

  it("holds the publisher lock through acknowledgment and marking", async () => {
    await queue(2);
    let release!: () => void;
    let entered!: () => void;
    const ready = new Promise<void>((resolve) => { entered = resolve; });
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const first = publishOutboxBatch(db.pool, async () => { entered(); await gate; });
    await ready;
    try {
      assert.equal((await db.pool.query("SELECT * FROM outbox WHERE published_at IS NULL")).rowCount, 2);
      assert.equal(await publishOutboxBatch(db.pool, async () => assert.fail("second publisher sent")), 0);
    } finally { release(); await first; }
    assert.equal((await db.pool.query("SELECT * FROM outbox WHERE published_at IS NULL")).rowCount, 0);
  });

  it("cleans only old published rows", async () => {
    await queue(3);
    await db.pool.query("UPDATE outbox SET published_at = now() - interval '8 days' WHERE id = 1");
    await db.pool.query("UPDATE outbox SET published_at = now() WHERE id = 2");
    assert.equal(await deletePublishedOutboxEvents(db.pool), 1);
    assert.equal((await db.pool.query("SELECT * FROM outbox")).rowCount, 2);
  });

  it("returns immediately while Kafka is unavailable, retries, then drains a committed wake-up", async () => {
    let available = false;
    let attempts = 0;
    let sends = 0;
    let disconnected = false;
    const producer: StatusProducer = {
      async connect() { attempts++; if (!available) throw new Error("offline"); },
      async send(record) { sends++; assert.equal(record.messages.length, 1); },
      async disconnect() { disconnected = true; },
    };
    const publisher = startOutboxPublisher(db.pool, producer);
    try {
      await queue(1);
      await waitFor(() => attempts > 0);
      assert.equal((await db.pool.query("SELECT * FROM outbox WHERE published_at IS NULL")).rowCount, 1);
      available = true;
      await waitFor(() => sends === 1);
      await waitFor(async () => (await db.pool.query("SELECT * FROM outbox WHERE published_at IS NULL")).rowCount === 0);
      await queue(1);
      wakePublisher();
      await waitFor(() => sends === 2);
    } finally { await publisher.stop(); }
    assert.ok(disconnected);
    await publisher.stop();
  });
});

it("shutdown interrupts an in-flight connection attempt without touching the database", async () => {
  let rejectConnection!: (err: Error) => void;
  const producer: StatusProducer = {
    connect: () => new Promise<void>((_, reject) => { rejectConnection = reject; }),
    async send() { assert.fail("must not send"); },
    async disconnect() { rejectConnection(new Error("connection aborted")); },
  };
  const publisher = startOutboxPublisher({ connect: () => assert.fail("must not acquire DB connection") } as never, producer);
  await publisher.stop();
});
