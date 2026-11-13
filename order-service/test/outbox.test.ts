import assert from "node:assert/strict";
import { test } from "node:test";
import { relayOutbox } from "../src/services/outbox.ts";

test("an outbox failure leaves the event pending, and a retry preserves its identity", async () => {
    let sent = false;
    const event = { event_id: "e-42", type: "order.errand.completed", occurred_at: new Date("2026-10-23T04:00:00.000Z"),
        data: { errandRef: "42", courierId: "courier" } };
    const db = { async query(sql: string) {
        if (sql.includes("SELECT")) return { rows: sent ? [] : [event] };
        if (sql.includes("SET sent_at")) sent = true;
        return { rows: [] };
    } };
    const attempts: unknown[] = [];
    await assert.rejects(relayOutbox(db, async (value) => { attempts.push(value); throw new Error("broker down"); }), /broker down/);
    assert.equal(sent, false);
    await relayOutbox(db, async (value) => { attempts.push(value); });
    assert.equal(sent, true);
    assert.deepEqual(attempts, [
        { eventId: "e-42", type: "order.errand.completed", occurredAt: "2026-10-23T04:00:00.000Z", data: { errandRef: "42", courierId: "courier" } },
        { eventId: "e-42", type: "order.errand.completed", occurredAt: "2026-10-23T04:00:00.000Z", data: { errandRef: "42", courierId: "courier" } },
    ]);
});

test("each relay pass first expires the errands nobody accepted by their needed-by time", async () => {
    const queries: string[] = [];
    const db = { async query(sql: string) { queries.push(sql); return { rows: [] }; } };
    await relayOutbox(db, async () => {});
    assert.match(queries[0], /SET status = 'Expired'[\s\S]*status = 'Open' AND needed_by_time <= now\(\)/);
    assert.match(queries[0], /'Open', 'Expired', 'system'/);
    assert.match(queries[0], /'order\.errand\.expired'/);
});

test("a relay claims its batch so other instances skip it, and hands back what it could not send", async () => {
    const queries: { sql: string; values?: unknown[] }[] = [];
    const occurred = (minute: number) => new Date(`2026-11-09T04:0${minute}:00.000Z`);
    const db = { async query(sql: string, values?: unknown[]) {
        queries.push({ sql, values });
        if (sql.includes("SET claimed_until = now()")) {
            // Returned out of order on purpose; the relay sends the oldest first.
            return { rows: [
                { event_id: "e-2", type: "order.errand.cancelled", occurred_at: occurred(2), data: { errandRef: "2" } },
                { event_id: "e-1", type: "order.errand.completed", occurred_at: occurred(1), data: { errandRef: "1" } },
                { event_id: "e-3", type: "order.errand.expired", occurred_at: occurred(3), data: { errandRef: "3" } },
            ] };
        }
        return { rows: [] };
    } };
    const sent: string[] = [];
    await assert.rejects(relayOutbox(db, async (event) => {
        if (event.eventId === "e-2") throw new Error("broker down");
        sent.push(event.eventId);
    }), /broker down/);

    const claim = queries.find((query) => query.sql.includes("SET claimed_until = now()"))!;
    assert.match(claim.sql, /FOR UPDATE SKIP LOCKED/);
    assert.match(claim.sql, /claimed_until IS NULL OR claimed_until < now\(\)/);
    assert.deepEqual(sent, ["e-1"]);
    assert.deepEqual(queries.filter((query) => query.sql.includes("SET sent_at")).map((query) => query.values), [["e-1"]]);
    const handedBack = queries.find((query) => query.sql.includes("SET claimed_until = NULL"))!;
    assert.deepEqual(handedBack.values, [["e-2", "e-3"]]);
});
