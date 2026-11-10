/**
 * AI Assistance Disclosure
 * Tool: OpenAI Codex (GPT-5.6 Luna, GPT-5.6 Sol, GPT-6 Sol and GPT-6.1 Sol), 2026-09-25 to 2026-11-11.
 * Scope: Implementation and test assistance under author-finalized User Service requirements and architecture.
 * Author review: Josh Wang Kai Kiat validated correctness, edited where needed, and verified behavior/tests.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DeletionEventDispatcher, type DeletedEventStore, type PendingDeletedEvent } from "./deletion-events";

const event: PendingDeletedEvent = {
  id: "deleted-event-a", userId: "user-a", createdAt: new Date("2026-11-02T00:00:00Z"),
};

describe("deletion event delivery", () => {
  it("keeps broker failures pending and retries the same UUID, event ID and deletion time", async () => {
    let published = false;
    const attempts: unknown[] = [];
    const store: DeletedEventStore = {
      pending: async () => published ? [] : [event],
      markPublished: async (id) => { assert.equal(id, event.id); published = true; },
    };
    const dispatcher = new DeletionEventDispatcher({ publishUserDeleted: async (...args) => {
      attempts.push(args);
      if (attempts.length === 1) throw new Error("broker unavailable");
    } }, store);
    await assert.rejects(dispatcher.flush(), /broker unavailable/);
    assert.equal(published, false);
    await dispatcher.flush();
    assert.equal(published, true);
    assert.deepEqual(attempts[0], attempts[1]);
    assert.deepEqual(attempts[1], [{ userId: event.userId }, event.id, event.createdAt.toISOString()]);
    await dispatcher.flush();
    assert.equal(attempts.length, 2);
  });

  it("redelivers with the same identity after Kafka accepts a message but marking fails", async () => {
    let published = false;
    let marks = 0;
    const attempts: unknown[] = [];
    const dispatcher = new DeletionEventDispatcher({ publishUserDeleted: async (...args) => { attempts.push(args); } }, {
      pending: async () => published ? [] : [event],
      markPublished: async () => {
        if (++marks === 1) throw new Error("database unavailable");
        published = true;
      },
    });
    await assert.rejects(dispatcher.flush(), /database unavailable/);
    await dispatcher.flush();
    assert.equal(published, true);
    assert.equal(attempts.length, 2);
    assert.deepEqual(attempts[0], attempts[1]);
  });

  it("shares an in-flight flush instead of publishing twice in one process", async () => {
    let sends = 0;
    const dispatcher = new DeletionEventDispatcher({ publishUserDeleted: async () => { sends += 1; } }, {
      pending: async () => [event], markPublished: async () => undefined,
    });
    await Promise.all([dispatcher.flush(), dispatcher.flush()]);
    assert.equal(sends, 1);
  });
});
