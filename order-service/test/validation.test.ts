/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (Claude Opus 5.5), date: 2026-10-16
 * Scope: Tests for create-errand input validation, written before the implementation per the approved plan.
 * Author review: Reviewed and approved by @mattis.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { validateCreateErrand } from "../src/domain/validation";

const now = new Date("2026-10-20T00:00:00Z");
const valid = {
  supplierId: "123e4567-e89b-42d3-a456-426614174000",
  items: [{ name: "Latte", quantity: 1 }],
  dropoffLocation: "COM1 L2",
  creditAmount: 10,
  listingDeadline: "2026-10-20T01:00:00Z",
  pickupDeadline: "2026-10-20T02:00:00Z",
  deliveryDeadline: "2026-10-20T03:00:00Z",
};

function firstField(body: unknown): string | undefined {
  const r = validateCreateErrand(body, now);
  return r.ok ? undefined : r.errors[0].field;
}

test("accepts valid body", () => {
  const r = validateCreateErrand(valid, now);
  assert.ok(r.ok);
  if (r.ok) {
    assert.equal(r.value.notes, null);
    assert.equal(r.value.creditAmount, 10);
    assert.equal(r.value.listingDeadline.toISOString(), "2026-10-20T01:00:00.000Z");
  }
});

for (const bad of ["10", 10.5, 0, 1001]) {
  test(`rejects creditAmount ${JSON.stringify(bad)}`, () => {
    assert.equal(firstField({ ...valid, creditAmount: bad }), "creditAmount");
  });
}

test("rejects empty items", () => {
  assert.equal(firstField({ ...valid, items: [] }), "items");
});

test("rejects 21 items", () => {
  const items = Array.from({ length: 21 }, () => ({ name: "Latte", quantity: 1 }));
  assert.equal(firstField({ ...valid, items }), "items");
});

test("rejects item quantity 0", () => {
  assert.equal(firstField({ ...valid, items: [{ name: "Latte", quantity: 0 }] }), "items[0].quantity");
});

test("rejects unknown field", () => {
  assert.equal(firstField({ ...valid, state: "OPEN" }), "state");
});

test("rejects deadline in the past", () => {
  assert.equal(firstField({ ...valid, listingDeadline: "2026-10-19T23:00:00Z" }), "listingDeadline");
});

test("rejects unordered deadlines", () => {
  assert.equal(firstField({ ...valid, pickupDeadline: "2026-10-20T00:30:00Z" }), "pickupDeadline");
});

test("rejects deadline without offset", () => {
  assert.equal(firstField({ ...valid, listingDeadline: "2026-10-20T01:00:00" }), "listingDeadline");
});

test("rejects non-uuid supplierId", () => {
  assert.equal(firstField({ ...valid, supplierId: "nope" }), "supplierId");
});

test("rejects non-object body", () => {
  assert.equal(firstField(null), "body");
  assert.equal(firstField([]), "body");
});

test("rejects impossible calendar date", () => {
  assert.equal(firstField({ ...valid, listingDeadline: "2026-02-31T10:00:00Z" }), "listingDeadline");
});

test("rejects hour 24", () => {
  assert.equal(firstField({ ...valid, listingDeadline: "2026-10-20T24:00:00Z" }), "listingDeadline");
});

test("accepts a valid offset timestamp", () => {
  const r = validateCreateErrand({ ...valid, listingDeadline: "2026-10-20T09:00:00+08:00" }, now);
  assert.ok(r.ok);
  if (r.ok) assert.equal(r.value.listingDeadline.toISOString(), "2026-10-20T01:00:00.000Z");
});
