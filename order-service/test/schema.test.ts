/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (Claude Opus 5.5), date: 2026-10-16
 * Scope: Schema tests: the check constraints on errands and the append-only errand_history.
 * Author review: Reviewed and approved by @mattis.
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, describe, it } from "node:test";
import { Pool } from "pg";
import { createTestDatabase, TestDatabase } from "./helpers";

let db: TestDatabase;
let pool: Pool;
before(async () => {
  db = await createTestDatabase();
  pool = db.pool;
});
after(async () => {
  await db.drop();
});

const HOUR = 3_600_000;

interface ErrandOverrides {
  courier_id?: string | null;
  requester_id?: string;
  state?: string;
  credit_amount?: number;
  listing_offset_h?: number;
  pickup_offset_h?: number;
}

async function insertErrand(o: ErrandOverrides = {}): Promise<string> {
  const id = randomUUID();
  const now = Date.now();
  await pool.query(
    `INSERT INTO errands (id, requester_id, courier_id, supplier_id, supplier_name, supplier_building_code,
                          supplier_location_description, items, dropoff_location, credit_amount, state,
                          reservation_operation_id, reservation_deadline, listing_deadline, pickup_deadline,
                          delivery_deadline)
     VALUES ($1, $2, $3, $4, 'Supplier', 'COM1', 'Level 1', '[]', 'Hall', $5, $6, $7, $8, $9, $10, $11)`,
    [
      id,
      o.requester_id ?? randomUUID(),
      o.courier_id ?? null,
      randomUUID(),
      o.credit_amount ?? 5,
      o.state ?? "PENDING_RESERVATION",
      randomUUID(),
      new Date(now + HOUR),
      new Date(now + (o.listing_offset_h ?? 1) * HOUR),
      new Date(now + (o.pickup_offset_h ?? 2) * HOUR),
      new Date(now + 3 * HOUR),
    ],
  );
  return id;
}

const checkViolation = { code: "23514" };

describe("errands schema", () => {
  it("accepts a valid errand", async () => {
    await insertErrand();
  });

  it("rejects unordered deadlines", async () => {
    await assert.rejects(insertErrand({ listing_offset_h: 2.5, pickup_offset_h: 2 }), checkViolation);
  });

  it("rejects courier equal to requester", async () => {
    const same = randomUUID();
    await assert.rejects(insertErrand({ requester_id: same, courier_id: same, state: "ACCEPTED" }), checkViolation);
  });

  it("rejects ACCEPTED without courier", async () => {
    await assert.rejects(insertErrand({ state: "ACCEPTED" }), checkViolation);
  });

  it("rejects credit_amount 0 and 1001", async () => {
    await assert.rejects(insertErrand({ credit_amount: 0 }), checkViolation);
    await assert.rejects(insertErrand({ credit_amount: 1001 }), checkViolation);
  });
});

describe("errand_history", () => {
  it("order_app cannot update errand_history", async () => {
    const errandId = await insertErrand();
    await pool.query(
      "INSERT INTO errand_history (errand_id, to_state, action, actor_type) VALUES ($1, 'PENDING_RESERVATION', 'CREATE', 'SYSTEM')",
      [errandId],
    );
    const client = await pool.connect();
    try {
      await client.query("SET ROLE order_app");
      await assert.rejects(client.query("UPDATE errand_history SET reason = 'x'"), { code: "42501" });
    } finally {
      await client.query("RESET ROLE").catch(() => {});
      client.release();
    }
  });
});
