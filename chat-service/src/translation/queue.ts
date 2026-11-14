/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: claude-sonnet-5-5), date: 2026-11-09
 * Scope: Implemented the team-specified BullMQ translation queue on the shared Redis, following
 *        order-service's `queue:<group>:<name>` key and default retry options.
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review: Congchen
 */
import { Queue, type ConnectionOptions, type JobsOptions } from "bullmq";
import type { LanguageCode } from "./languages.js";

// order-service convention: key `queue:chat:translation` = prefix `queue:chat` + name `translation`.
export const TRANSLATION_QUEUE_PREFIX = "queue:chat";
export const TRANSLATION_QUEUE_NAME = "translation";
// Same retry policy as order-service's default job options.
export const TRANSLATION_JOB_OPTIONS: JobsOptions = {
  attempts: 5,
  backoff: { type: "exponential", delay: 1_000 },
  removeOnComplete: true,
};

export interface TranslationJob {
  conversationId: string;
  userId: string;
  language: LanguageCode;
  /** Absent for a toggle-on backfill: every untranslated received message is prepared. */
  messageIds?: string[];
}
export type TranslationEnqueuer = (jobs: TranslationJob[]) => Promise<void>;

export function createTranslationQueue(connection: ConnectionOptions) {
  const queue = new Queue(TRANSLATION_QUEUE_NAME, {
    connection,
    prefix: TRANSLATION_QUEUE_PREFIX,
    defaultJobOptions: TRANSLATION_JOB_OPTIONS,
  });
  const enqueue: TranslationEnqueuer = async (jobs) => {
    await queue.addBulk(
      jobs.map((job) => ({
        name: "prepare_translation",
        data: job,
        // A per-message job id makes a repeated add of the same message and user a no-op.
        ...(job.messageIds?.length === 1
          ? { opts: { jobId: `${job.messageIds[0]}-${job.userId}` } }
          : {}),
      })),
    );
  };
  return { enqueue, close: () => queue.close() };
}
