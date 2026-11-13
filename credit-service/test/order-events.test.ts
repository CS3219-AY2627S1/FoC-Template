import assert from "node:assert/strict";
import { test } from "node:test";
import { handleOrderEvent } from "../src/order-events.ts";

test("completed errands transfer and cancelled or expired errands release using the same reference", async () => {
    const calls: unknown[] = [];
    const operations = {
        transfer: async (ref: string, courier: string) => { calls.push(["transfer", ref, courier]); },
        release: async (ref: string) => { calls.push(["release", ref]); },
    };
    for (const type of ["completed", "cancelled", "expired"]) {
        await handleOrderEvent({ eventId: "event-1", type: `order.errand.${type}`,
            occurredAt: "2026-10-23T04:00:00.000Z", data: { errandRef: "42", courierId: "courier" } }, operations);
    }
    assert.deepEqual(calls, [["transfer", "42", "courier"], ["release", "42"], ["release", "42"]]);
});

test("malformed events do not mutate credits", async () => {
    let calls = 0;
    const operations = { transfer: async () => { calls++; }, release: async () => { calls++; } };
    for (const event of [null, {}, { eventId: "e", type: "order.errand.completed", data: { errandRef: "42" } },
        { eventId: "e", type: "wrong", data: { errandRef: "42" } }]) {
        await assert.rejects(handleOrderEvent(event, operations), /MALFORMED_ORDER_EVENT/);
    }
    assert.equal(calls, 0);
});

test("a credit failure propagates so the consumer can retry instead of acknowledging", async () => {
    await assert.rejects(handleOrderEvent({ eventId: "e", type: "order.errand.cancelled", data: { errandRef: "42" } }, {
        transfer: async () => {}, release: async () => { throw new Error("database down"); },
    }), /database down/);
});
