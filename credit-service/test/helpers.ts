/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (Claude Opus 5.5), date: 2026-10-16
 * Scope: Test helpers: a throwaway database with the real migrations applied, message
 *        builders, and the reconciliation check from implementation-proposal.md §12.
 * Author review: Reviewed and approved by @phuc
 * Additional AI assistance: OpenAI Codex, 2026-11-09. Scope: wait for actual fixture disconnection before database deletion. Review: Reviewed and approved by @ron on 2026-11-09.
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { Client, Pool } from "pg";
import { handleAccountStatus } from "../src/accounts";
import { ReservationTimedOut, ReserveRequested, TerminalEvent, TerminalEventType } from "../src/messages";
import { migrate } from "../src/migrations";

// TEST_DATABASE_URL must point at a disposable PostgreSQL server as a superuser (to create a
// database and the credit_app role), e.g. postgres://postgres:postgres@localhost:55432/postgres
function adminUrl(): string {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) throw new Error("TEST_DATABASE_URL is not set (a superuser URL for a disposable PostgreSQL server)");
  return url;
}

export interface TestDatabase {
  pool: Pool;
  drop(): Promise<void>;
}

/** Creates a fresh database, applies migrations/*.sql, and returns a pool for it. */
export async function createTestDatabase(): Promise<TestDatabase> {
  const name = `credit_test_${randomUUID().replace(/-/g, "")}`;
  const admin = new Client({ connectionString: adminUrl() });
  await admin.connect();
  try {
    await admin.query(`CREATE DATABASE ${name}`);
    // The migrations grant to credit_app; it is cluster-wide, so it may already exist
    await admin.query(`DO $$ BEGIN CREATE ROLE credit_app NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$`);
  } finally {
    await admin.end();
  }

  const url = new URL(adminUrl());
  url.pathname = `/${name}`;
  const migrator = new Client({ connectionString: url.toString() });
  await migrator.connect();
  const log = console.log;
  console.log = () => {}; // keep "Migrations: applied ..." out of the test output
  try {
    await migrate(migrator);
  } finally {
    console.log = log;
    await migrator.end();
  }

  const pool = new Pool({ connectionString: url.toString(), max: 20 });
  return {
    pool,
    async drop() {
      await pool.end();
      const c = new Client({ connectionString: adminUrl() });
      await c.connect();
      try {
        // pg-pool may resolve end() while socket termination is still in flight.
        // Do not force-kill those clients: their late errors escape the finished test.
        const deadline = Date.now() + 5_000;
        while ((await c.query("SELECT EXISTS (SELECT 1 FROM pg_stat_activity WHERE datname=$1) AS connected", [name])).rows[0].connected) {
          if (Date.now() >= deadline) throw new Error(`Test database ${name} still has connected clients after shutdown`);
          await new Promise(resolve => setTimeout(resolve, 25));
        }
        await c.query(`DROP DATABASE ${name}`);
      } finally {
        await c.end();
      }
    },
  };
}

/** Creates an ACTIVE account with the initial grant, as a first-ACTIVE notification would. */
export async function activeAccount(pool: Pool): Promise<string> {
  const accountId = randomUUID();
  const outcome = await handleAccountStatus(pool, {
    operationId: randomUUID(),
    accountId,
    newStatus: "ACTIVE",
    firstActive: true,
  });
  assert.equal(outcome.kind, "applied");
  return accountId;
}

export function reserveMsg(requesterId: string, amount: number, orderId: string = randomUUID()): ReserveRequested {
  return { type: "ReserveRequested", operationId: randomUUID(), orderId, requesterId, amount };
}

export function terminalMsg(
  type: TerminalEventType,
  reserve: ReserveRequested,
  courierId: string | null = null,
): TerminalEvent {
  return {
    type,
    operationId: randomUUID(),
    orderId: reserve.orderId,
    requesterId: reserve.requesterId,
    courierId,
    amount: reserve.amount,
  };
}

export function timedOutMsg(reserve: ReserveRequested): ReservationTimedOut {
  return {
    type: "ReservationTimedOut",
    operationId: randomUUID(),
    orderId: reserve.orderId,
    requesterId: reserve.requesterId,
    amount: reserve.amount,
  };
}

export async function balanceOf(pool: Pool, userId: string): Promise<{ available: number; reserved: number }> {
  const { rows } = await pool.query(
    "SELECT available_balance, reserved_balance FROM credit_accounts WHERE user_id = $1",
    [userId],
  );
  return { available: Number(rows[0].available_balance), reserved: Number(rows[0].reserved_balance) };
}

export async function transactionTypes(pool: Pool, userId: string): Promise<string[]> {
  const { rows } = await pool.query("SELECT type FROM credit_transactions WHERE user_id = $1 ORDER BY id", [userId]);
  return rows.map((r) => r.type);
}

/**
 * §12 "after every test": each account's balances equal the sum of its deltas, and its
 * reserved balance equals the sum of its HELD reservations. Balances >= 0 is a CHECK.
 */
export async function assertLedgerReconciles(pool: Pool): Promise<void> {
  const { rows } = await pool.query(`
    SELECT a.user_id, a.available_balance, a.reserved_balance, t.available_sum, t.reserved_sum, h.held_sum
    FROM credit_accounts a
    LEFT JOIN (SELECT user_id, sum(available_delta) AS available_sum, sum(reserved_delta) AS reserved_sum
               FROM credit_transactions GROUP BY user_id) t USING (user_id)
    LEFT JOIN (SELECT requester_id AS user_id, sum(amount) AS held_sum
               FROM credit_reservations WHERE status = 'HELD' GROUP BY requester_id) h USING (user_id)
    WHERE a.available_balance <> coalesce(t.available_sum, 0)
       OR a.reserved_balance  <> coalesce(t.reserved_sum, 0)
       OR a.reserved_balance  <> coalesce(h.held_sum, 0)
  `);
  assert.deepEqual(rows, [], "every balance must equal its ledger and its HELD reservations");
}
