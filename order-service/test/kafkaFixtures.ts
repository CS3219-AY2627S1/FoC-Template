/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (Claude Opus 5.5), date: 2026-10-18
 * Scope: Shared fixtures for the Kafka integration tests: errands, Credit replies as they
 *        arrive on credit.results, and a fake producer.
 * Author review: Reviewed and approved by @phuc
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { applyTransition, createErrand } from "../src/errands/repository";
import type { Actor, Errand, SupplierSnapshot } from "../src/errands/errand";
import type { KafkaRecord, ProducerLike } from "../src/kafka/client";

const HOUR = 3_600_000;
export const SUPPLIER: SupplierSnapshot = {
  id: "5d0c1e2a-3b4c-4d5e-8f60-718293a4b5c6",
  name: "Frontier Canteen",
  buildingCode: "COM1",
  locationDescription: "Level 1, next to the lift",
};
export const REQUESTER = "a1111111-1111-4111-8111-111111111111";
export const COURIER = "b2222222-2222-4222-8222-222222222222";

export const member = (id: string): Actor => ({ kind: "user", id, role: "MEMBER" });

export async function newErrand(pool: Pool, creditAmount = 10): Promise<Errand> {
  const now = Date.now();
  return createErrand(
    pool,
    REQUESTER,
    {
      supplierId: SUPPLIER.id,
      items: [{ name: "Chicken rice", quantity: 1 }],
      dropoffLocation: "COM2 lobby",
      notes: null,
      creditAmount,
      listingDeadline: new Date(now + HOUR),
      pickupDeadline: new Date(now + 2 * HOUR),
      deliveryDeadline: new Date(now + 3 * HOUR),
    },
    SUPPLIER,
  );
}

/** Walks an OPEN errand through accept, pickup, deliver and confirm. */
export async function complete(pool: Pool, id: string): Promise<void> {
  for (const action of ["accept", "pickup", "deliver", "confirm"] as const) {
    const actor = action === "confirm" ? member(REQUESTER) : member(COURIER);
    assert.equal((await applyTransition(pool, id, action, actor)).ok, true, action);
  }
}

export async function state(pool: Pool, id: string): Promise<string> {
  const { rows } = await pool.query("SELECT state FROM errands WHERE id = $1", [id]);
  return rows[0]?.state;
}

/** A credit.results reply body as Credit Service sends it. */
export function reply(
  e: Errand,
  type: "CreditReserved" | "CreditReservationRejected",
  over: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    type,
    event_id: randomUUID(),
    operation_id: e.reservationOperationId,
    order_id: e.id,
    ...(type === "CreditReserved" ? { reservation_id: randomUUID() } : { reason_code: "INSUFFICIENT_CREDIT" }),
    occurred_at: new Date().toISOString(),
    schema_version: 1,
    ...over,
  };
}

/** Records every send; `failNext` makes the next n sends (or connects) throw. */
export class FakeProducer implements ProducerLike {
  readonly sends: { topic: string; messages: KafkaRecord[] }[] = [];
  connects = 0;
  failNextConnects = 0;
  failNextSends = 0;

  async connect(): Promise<void> {
    this.connects++;
    if (this.failNextConnects > 0) {
      this.failNextConnects--;
      throw new Error("broker unreachable");
    }
  }

  async send(record: { topic: string; messages: KafkaRecord[] }): Promise<void> {
    if (this.failNextSends > 0) {
      this.failNextSends--;
      throw new Error("Local: Message timed out");
    }
    this.sends.push({ topic: record.topic, messages: record.messages.map((m) => ({ ...m })) });
  }

  async disconnect(): Promise<void> {}

  /** Every message sent, in order, with its value parsed. */
  messages(): { topic: string; key: string | null; body: Record<string, unknown> }[] {
    return this.sends.flatMap((s) => s.messages.map((m) => ({ topic: s.topic, key: m.key, body: JSON.parse(m.value) })));
  }
}

export async function waitFor<T>(what: string, check: () => Promise<T | undefined | false> | T | undefined | false, timeoutMs = 10_000): Promise<T> {
  const until = Date.now() + timeoutMs;
  for (;;) {
    const value = await check();
    if (value) return value;
    if (Date.now() > until) throw new Error(`timed out waiting for ${what}`);
    await new Promise((r) => setTimeout(r, 25));
  }
}
