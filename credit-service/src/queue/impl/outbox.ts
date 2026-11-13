import type { Db } from "../../prisma/db.ts";

import { OutboxRepository, type IOutboxRepository } from "../../prisma/outbox.ts";
import { OutboxWorker, type IOutboxSource, type IOutboxTx, type OutboxRow } from "../outboxWorker.ts";
import type { IQueueProvider } from "../provider.ts";

// wrappers around db handling
const makeOutboxTx = (outbox: IOutboxRepository): IOutboxTx => ({
    fetchPending: async limit => {
        const pendingEvents = await outbox.getPendingEvents(limit);
        return pendingEvents.map<OutboxRow>(r => ({ ...r })); // type check
    },
    markCompleted: id =>
        outbox.updateCompletedEvent(id as Parameters<IOutboxRepository["updateCompletedEvent"]>[0]),
    markFailed: (id, errMsg, retryCount, nextRetryAt) =>
        outbox.updateFailedEvent(id as Parameters<IOutboxRepository["updateFailedEvent"]>[0], errMsg, retryCount, nextRetryAt)
});

const makeOutboxSource = (db: Db): IOutboxSource => ({
    withTransaction: <R>(fn: (tx: IOutboxTx) => Promise<R>) =>
        db.transaction(tx => {
            const outbox = new OutboxRepository(tx);
            return fn(makeOutboxTx(outbox));
        }),
});

export const makeOutboxWorker = (db: Db, msgQueue: IQueueProvider): OutboxWorker => {
    return new OutboxWorker(makeOutboxSource(db), msgQueue);
}
