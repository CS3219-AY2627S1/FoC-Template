/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (Claude Opus 5.5), date: 2026-10-16
 * Scope: Tests for the errand read queries (open listing, my errands, detail with history,
 *        admin listing, paging), written before the implementation per the approved plan.
 * Author review: Reviewed and approved by @mattis.
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, test } from "node:test";
import { Pool } from "pg";
import { createTestDatabase, TestDatabase } from "./helpers";
import { adminListErrands, getErrandForViewer, listMine, listOpen } from "../src/errands/queries";
import { applyTransition, createErrand } from "../src/errands/repository";
import type { Errand, SupplierSnapshot } from "../src/errands/errand";

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
const SUPPLIER: SupplierSnapshot = {
  id: "5d0c1e2a-3b4c-4d5e-8f60-718293a4b5c6",
  name: "Frontier Canteen",
  buildingCode: "COM1",
  locationDescription: "Level 1, next to the lift",
};

async function newErrand(requesterId: string, listingHours = 1): Promise<Errand> {
  const now = Date.now();
  return createErrand(
    pool,
    requesterId,
    {
      supplierId: SUPPLIER.id,
      items: [{ name: "Chicken rice", quantity: 1 }],
      dropoffLocation: "COM2 lobby",
      notes: null,
      creditAmount: 10,
      listingDeadline: new Date(now + listingHours * HOUR),
      pickupDeadline: new Date(now + (listingHours + 1) * HOUR),
      deliveryDeadline: new Date(now + (listingHours + 2) * HOUR),
    },
    SUPPLIER,
  );
}

// Stands in for the CreditReserved reply
async function newOpenErrand(requesterId: string, listingHours = 1): Promise<Errand> {
  const e = await newErrand(requesterId, listingHours);
  await pool.query(`UPDATE errands SET state = 'OPEN' WHERE id = $1`, [e.id]);
  return { ...e, state: "OPEN" };
}

const ids = (items: Errand[]) => items.map((e) => e.id);

test("listOpen excludes own errands", async () => {
  const me = randomUUID();
  const other = randomUUID();
  const mine = await newOpenErrand(me);
  const theirs = await newOpenErrand(other);
  const page = await listOpen(pool, me, { page: 0, size: 100 });
  assert.ok(ids(page.items).includes(theirs.id));
  assert.ok(!ids(page.items).includes(mine.id));
});

test("listOpen excludes PENDING_RESERVATION, ACCEPTED and past-listing errands", async () => {
  const me = randomUUID();
  const other = randomUUID();
  const open = await newOpenErrand(other);
  const pending = await newErrand(other);
  const accepted = await newOpenErrand(other);
  const r = await applyTransition(pool, accepted.id, "accept", { kind: "user", id: randomUUID(), role: "MEMBER" });
  assert.ok(r.ok);
  const past = await newOpenErrand(other);
  await pool.query(`UPDATE errands SET listing_deadline = now() - interval '1 minute' WHERE id = $1`, [past.id]);

  const got = ids((await listOpen(pool, me, { page: 0, size: 100 })).items);
  assert.ok(got.includes(open.id));
  for (const e of [pending, accepted, past]) assert.ok(!got.includes(e.id), `${e.id} should be hidden`);
});

test("listMine as courier shows only assigned errands", async () => {
  const requester = randomUUID();
  const courier = randomUUID();
  const a = await newOpenErrand(requester);
  const b = await newOpenErrand(requester);
  const notTaken = await newOpenErrand(requester);
  for (const e of [a, b]) {
    assert.ok((await applyTransition(pool, e.id, "accept", { kind: "user", id: courier, role: "MEMBER" })).ok);
  }
  const asCourier = await listMine(pool, courier, { as: "courier", page: 0, size: 20 });
  assert.equal(asCourier.totalItems, 2);
  assert.deepEqual(new Set(ids(asCourier.items)), new Set([a.id, b.id]));
  assert.ok(!ids(asCourier.items).includes(notTaken.id));

  const asRequester = await listMine(pool, requester, { as: "requester", page: 0, size: 20 });
  assert.equal(asRequester.totalItems, 3);
  const accepted = await listMine(pool, requester, { as: "requester", state: "ACCEPTED", page: 0, size: 20 });
  assert.equal(accepted.totalItems, 2);
  assert.equal((await listMine(pool, courier, { as: "requester", page: 0, size: 20 })).totalItems, 0);
});

test("getErrandForViewer hides an ACCEPTED errand from an unrelated member", async () => {
  const requester = randomUUID();
  const courier = randomUUID();
  const admin = randomUUID();
  const stranger = randomUUID();
  const e = await newOpenErrand(requester);
  assert.ok((await applyTransition(pool, e.id, "accept", { kind: "user", id: courier, role: "MEMBER" })).ok);

  assert.equal(await getErrandForViewer(pool, e.id, { id: stranger, role: "MEMBER" }), null);
  assert.equal((await getErrandForViewer(pool, e.id, { id: requester, role: "MEMBER" }))?.id, e.id);
  assert.equal((await getErrandForViewer(pool, e.id, { id: courier, role: "MEMBER" }))?.id, e.id);
  assert.equal((await getErrandForViewer(pool, e.id, { id: admin, role: "ADMINISTRATOR" }))?.id, e.id);
  assert.equal(await getErrandForViewer(pool, randomUUID(), { id: admin, role: "ADMINISTRATOR" }), null);

  const open = await newOpenErrand(requester);
  assert.equal((await getErrandForViewer(pool, open.id, { id: stranger, role: "MEMBER" }))?.id, open.id);
  const pending = await newErrand(requester);
  assert.equal(await getErrandForViewer(pool, pending.id, { id: stranger, role: "MEMBER" }), null);
});

test("getErrandForViewer includes history in order", async () => {
  const requester = randomUUID();
  const courier = randomUUID();
  const e = await newOpenErrand(requester);
  assert.ok((await applyTransition(pool, e.id, "accept", { kind: "user", id: courier, role: "MEMBER" })).ok);
  assert.ok((await applyTransition(pool, e.id, "pickup", { kind: "user", id: courier, role: "MEMBER" })).ok);

  const got = await getErrandForViewer(pool, e.id, { id: requester, role: "MEMBER" });
  assert.ok(got);
  assert.deepEqual(
    got.history.map((h) => [h.fromState, h.toState, h.action]),
    [
      [null, "PENDING_RESERVATION", "create"],
      ["OPEN", "ACCEPTED", "accept"],
      ["ACCEPTED", "PICKED_UP", "pickup"],
    ],
  );
  assert.equal(got.history[0].actorType, "USER");
  assert.equal(got.history[0].actorId, requester);
  assert.equal(got.history[1].actorId, courier);
  assert.equal(got.history[0].reason, null);
  assert.ok(got.history[0].at instanceof Date);
});

test("adminListErrands filters by requesterId and state DISPUTED", async () => {
  const requester = randomUUID();
  const otherRequester = randomUUID();
  const disputed = await newOpenErrand(requester);
  const open = await newOpenErrand(requester);
  const otherDisputed = await newOpenErrand(otherRequester);
  await pool.query(`UPDATE errands SET state = 'DISPUTED' WHERE id = ANY($1)`, [[disputed.id, otherDisputed.id]]);

  const got = await adminListErrands(pool, { requesterId: requester, state: "DISPUTED", page: 0, size: 20 });
  assert.deepEqual(ids(got.items), [disputed.id]);
  assert.equal(got.totalItems, 1);
  assert.equal((await adminListErrands(pool, { requesterId: requester, page: 0, size: 20 })).totalItems, 2);
  assert.ok(open.id);
});

test("paging returns totalItems and respects size", async () => {
  const requester = randomUUID();
  const viewer = randomUUID();
  const made: Errand[] = [];
  for (let i = 0; i < 5; i++) made.push(await newOpenErrand(requester, i + 1));

  const p0 = await listMine(pool, requester, { as: "requester", page: 0, size: 2 });
  const p1 = await listMine(pool, requester, { as: "requester", page: 1, size: 2 });
  const p2 = await listMine(pool, requester, { as: "requester", page: 2, size: 2 });
  assert.deepEqual([p0.items.length, p1.items.length, p2.items.length], [2, 2, 1]);
  for (const p of [p0, p1, p2]) assert.equal(p.totalItems, 5);
  assert.deepEqual([p1.page, p1.size], [1, 2]);
  assert.equal(new Set([...ids(p0.items), ...ids(p1.items), ...ids(p2.items)]).size, 5);

  const beyond = await listMine(pool, requester, { as: "requester", page: 9, size: 2 });
  assert.deepEqual(beyond.items, []);
  assert.equal(beyond.totalItems, 5);

  const open = await listOpen(pool, viewer, { page: 0, size: 3 });
  assert.equal(open.items.length, 3);
  assert.ok(open.totalItems >= 5);
});
