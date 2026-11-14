/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: claude-sonnet-5-5), date: 2026-11-09
 * Scope: Implemented the team-specified translation job: translate a user's untranslated
 *        received messages, store one translated_messages row each, then signal completion.
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review: Congchen
 */
import { Worker, type ConnectionOptions } from "bullmq";
import type { PrismaClient } from "../db/prisma.js";
import type { TranslatedPublisher } from "../realtime/messages.js";
import type { Translator } from "./gemini.js";
import {
  TRANSLATION_QUEUE_NAME,
  TRANSLATION_QUEUE_PREFIX,
  type TranslationJob,
} from "./queue.js";

// Bounds the size of each LLM request.
export const TRANSLATION_BATCH_SIZE = 20;

export function createTranslationProcessor(deps: {
  prisma: PrismaClient;
  translate: Translator;
  publish?: TranslatedPublisher;
}) {
  return async (job: TranslationJob) => {
    const { prisma } = deps;
    const participant = await prisma.chatParticipant.findFirst({
      where: { chatId: job.conversationId, userId: job.userId, revokedAt: null },
    });
    // Toggled off (or language changed) since the job was queued: do nothing, spend nothing.
    if (!participant || participant.translateTo !== job.language) return 0;
    const pending = await prisma.message.findMany({
      where: {
        chatId: job.conversationId,
        ...(job.messageIds ? { id: { in: job.messageIds } } : {}),
        type: { in: ["TEXT", "SYSTEM"] },
        content: { not: null },
        // Received messages only: SQL NOT alone excludes NULL (system) senders.
        OR: [{ senderId: null }, { senderId: { not: job.userId } }],
        translations: { none: { userId: job.userId } },
      },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      select: { id: true, content: true },
    });
    let stored = 0;
    for (let i = 0; i < pending.length; i += TRANSLATION_BATCH_SIZE) {
      const batch = pending.slice(i, i + TRANSLATION_BATCH_SIZE);
      const result = await deps.translate(
        job.language,
        Object.fromEntries(batch.map((m) => [m.id, m.content!])),
      );
      const rows = batch
        .filter((m) => result[m.id] !== undefined)
        .map((m) => ({
          messageId: m.id,
          userId: job.userId,
          content: result[m.id]!,
        }));
      if (rows.length === 0) continue;
      await prisma.translatedMessage.createMany({
        data: rows,
        skipDuplicates: true,
      });
      stored += rows.length;
      for (const row of rows) {
        try {
          deps.publish?.({
            messageId: row.messageId,
            conversationId: job.conversationId,
            userId: job.userId,
            translatedContent: row.content,
          });
        } catch (error) {
          console.error(error);
        }
      }
    }
    return stored;
  };
}

export function startTranslationWorker(
  connection: ConnectionOptions,
  processor: ReturnType<typeof createTranslationProcessor>,
) {
  const worker = new Worker<TranslationJob>(
    TRANSLATION_QUEUE_NAME,
    (job) => processor(job.data),
    { connection, prefix: TRANSLATION_QUEUE_PREFIX },
  );
  worker.on("failed", (job, error) =>
    console.error(`translation job ${job?.id} failed`, error),
  );
  return worker;
}
