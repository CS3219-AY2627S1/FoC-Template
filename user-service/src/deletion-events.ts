/**
 * AI Assistance Disclosure
 * Tool: OpenAI Codex (GPT-5.6 Luna, GPT-5.6 Sol, GPT-6 Sol and GPT-6.1 Sol), 2026-09-25 to 2026-11-11.
 * Scope: Implementation and test assistance under author-finalized User Service requirements and architecture.
 * Author review: Josh Wang Kai Kiat validated correctness, edited where needed, and verified behavior/tests.
 */

import { prisma } from "./db";
import type { UserEventPublisher } from "./events";

export type PendingDeletedEvent = { id: string; userId: string; createdAt: Date };
export interface DeletedEventStore {
  pending(): Promise<PendingDeletedEvent[]>;
  markPublished(id: string): Promise<void>;
}

const databaseStore: DeletedEventStore = {
  pending: () => prisma.userDeletedOutbox.findMany({
    where: { publishedAt: null }, orderBy: [{ createdAt: "asc" }, { id: "asc" }], take: 20,
  }),
  markPublished: async (id) => {
    await prisma.userDeletedOutbox.update({ where: { id }, data: { publishedAt: new Date() } });
  },
};

export class DeletionEventDispatcher {
  private running?: Promise<void>;
  constructor(private publisher: Pick<UserEventPublisher, "publishUserDeleted">, private store: DeletedEventStore = databaseStore) {}

  flush(): Promise<void> {
    if (this.running) return this.running;
    this.running = this.publishPending().finally(() => { this.running = undefined; });
    return this.running;
  }

  private async publishPending(): Promise<void> {
    for (const event of await this.store.pending()) {
      await this.publisher.publishUserDeleted({ userId: event.userId }, event.id, event.createdAt.toISOString());
      // A crash after Kafka accepts the message can cause redelivery. Consumers
      // must deduplicate eventId and never recreate a deleted UUID on a late
      // UserVerified event from another in-flight publisher.
      await this.store.markPublished(event.id);
    }
  }
}
