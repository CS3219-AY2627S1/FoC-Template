import { describe, it } from "@std/testing/bdd";
import { assert, assertEquals, assertInstanceOf, assertRejects } from "@std/assert";
import { spy } from "@std/testing/mock";
import { OutboxWorker, BATCH_SIZE, MAX_RETRIES } from "../src/queue/outboxWorker.ts";
import type { IOutboxTx, OutboxRow } from "../src/queue/outboxWorker.ts";
import { makeOutboxSource, makeOutboxTx, makeQueue } from "./util.ts";

const makeEvent = (overrides: Partial<OutboxRow> = {}): OutboxRow => ({
    id: 1,
    type: "userRegistered",
    topic: "user.registered",
    payload: { userId: 100 },
    retryCount: 0,
    ...overrides,
});

describe("OutboxWorker.relayOnce", () => {
    it("does nothing when no pending events", async () => {
        const fetchPending = spy(async () => []);
        const source = makeOutboxSource({ fetchPending });
        const publishEvent = spy(async () => {});
        const worker = new OutboxWorker(source, makeQueue({ publishEvent }));

        const processed = await worker.relayOnce();

        assertEquals(processed, 0);
        assertEquals(fetchPending.calls.length, 1);
        assertEquals(fetchPending.calls[0].args, [BATCH_SIZE]);
        assertEquals(publishEvent.calls.length, 0);
    });

    it("publishes pending events in batch and marks completion", async () => {
        const events = [
            makeEvent({ id: 1, payload: { userId: 42 } }),
            makeEvent({ id: 2, payload: { userId: 43 } }),
        ];
        const fetchPending = spy(async () => events);
        const markCompleted = spy(async () => {});
        const markFailed = spy(async () => {});
        const source = makeOutboxSource({ fetchPending, markCompleted, markFailed });
        const publishEvent = spy(async () => {});
        const worker = new OutboxWorker(source, makeQueue({ publishEvent }));

        const processed = await worker.relayOnce();

        assertEquals(processed, 2);
        assertEquals(publishEvent.calls.length, 2);
        assertEquals(publishEvent.calls[0].args, ["user.registered", { type: "userRegistered", userId: 42 }]);
        assertEquals(publishEvent.calls[1].args, ["user.registered", { type: "userRegistered", userId: 43 }]);
        assertEquals(markCompleted.calls.length, 2);
        assertEquals(markCompleted.calls[0].args, [1]);
        assertEquals(markCompleted.calls[1].args, [2]);
        assertEquals(markFailed.calls.length, 0);
    });

    it("propagates errors on db failure", async () => {
        const fetchPending = spy(async () => { throw new Error("db offline"); });
        const source = makeOutboxSource({ fetchPending });
        const worker = new OutboxWorker(source, makeQueue());

        await assertRejects(() => worker.relayOnce(), Error, "db offline");
    });

    it("aborts batch if failure cannot be recorded", async () => {
        const events = [makeEvent({ id: 1 }), makeEvent({ id: 2 })];
        const fetchPending = spy(async () => events);
        const publishEvent = spy(async () => { throw new Error("queue down"); });
        const markFailed = spy(async () => { throw new Error("db down"); });
        const source = makeOutboxSource({ fetchPending, markFailed });
        const worker = new OutboxWorker(source, makeQueue({ publishEvent }));

        await assertRejects(() => worker.relayOnce(), Error, "db down");

        assertEquals(markFailed.calls.length, 1);
        const [id] = (<unknown[]>markFailed.calls[0].args) as Parameters<IOutboxTx["markFailed"]>;
        assertEquals(id, 1);
    });
});

describe("OutboxWorker.relayRow", () => {
    it("marks the event failed with backoff on publish failure", async () => {
        const publishEvent = spy(async () => { throw new Error("queue down"); });
        const markCompleted = spy(async () => {});
        const markFailed = spy(async () => {});
        const tx = makeOutboxTx({ markCompleted, markFailed });
        const worker = new OutboxWorker(makeOutboxSource(), makeQueue({ publishEvent }));

        const before = Temporal.Now.instant().epochMilliseconds;
        await worker.relayRow(tx, makeEvent({ id: 10, retryCount: 0 }));

        assertEquals(markCompleted.calls.length, 0);
        assertEquals(markFailed.calls.length, 1);

        const [id, errMsg, retryCount, nextRetryAt] =
            (<unknown[]>markFailed.calls[0].args) as Parameters<IOutboxTx["markFailed"]>;
        assertEquals(id, 10);
        assertEquals(errMsg, "queue down");
        assertEquals(retryCount, 1);
        assertInstanceOf(nextRetryAt, Temporal.Instant);

        const delayMs = (nextRetryAt as Temporal.Instant).epochMilliseconds - before;
        assert(delayMs >= 0, "backoff not set");
    });

    it("gives up once max retries exhausted is reached", async () => {
        const publishEvent = spy(async () => { throw new Error("queue down"); });
        const markFailed = spy(async () => {});
        const tx = makeOutboxTx({ markFailed });
        const worker = new OutboxWorker(makeOutboxSource(), makeQueue({ publishEvent }));

        await worker.relayRow(tx, makeEvent({ id: 1, retryCount: MAX_RETRIES - 1 }));

        assertEquals(markFailed.calls.length, 1);
        const [, , retryCount, nextRetryAt] =
            (<unknown[]>markFailed.calls[0].args) as Parameters<IOutboxTx["markFailed"]>;
        assertEquals(retryCount, MAX_RETRIES);
        assertEquals(nextRetryAt, null);
    });

    it("failure to mark completion is recorded as failure in db", async () => {
        const publishEvent = spy(async () => {});
        const markCompleted = spy(async () => { throw new Error("db write failed"); });
        const markFailed = spy(async () => {});
        const tx = makeOutboxTx({ markCompleted, markFailed });
        const worker = new OutboxWorker(makeOutboxSource(), makeQueue({ publishEvent }));

        await worker.relayRow(tx, makeEvent({ id: 1 }));

        assertEquals(markCompleted.calls.length, 1);
        assertEquals(markFailed.calls.length, 1);
        const [, errMsg] =
            (<unknown[]>markFailed.calls[0].args) as Parameters<IOutboxTx["markFailed"]>;
        assertEquals(errMsg, "db write failed");
    });
});