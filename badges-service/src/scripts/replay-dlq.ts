/**
 * AI Assistance Disclosure
 * Tool: Claude Code (Claude Opus 5.5), date: 2026-11-09
 * Scope: Generated the command that replays foc.badges.dlq (npm run replay:dlq).
 * Author review: Ngooi Jun Sen to validate before merge.
 */

import { config } from '../config.js';
import { queryClient } from '../database/index.js';
import { replayDeadLetter, type ReplayOutcome } from '../messaging/dlq.js';
import { createKafka } from '../messaging/kafka.js';

// Run inside the badges pod: kubectl exec deploy/badges -- npm run replay:dlq
// Reads the dead-letter topic with its own consumer group, from where the last
// replay stopped. Dead letters written after this run started (including the
// ones it re-queues) are left for the next run, so it always finishes.
const IDLE_MS = Number(process.env.DLQ_IDLE_MS ?? 10_000);
const startedAt = Date.now();
const summary: Record<ReplayOutcome, number> = { replayed: 0, requeued: 0, dropped: 0 };

const kafka = createKafka(config.kafka);
const producer = kafka.producer();
const consumer = kafka.consumer({
  kafkaJS: { groupId: config.kafka.dlqGroupId, fromBeginning: true, autoCommit: false },
});

try {
  await producer.connect();
  await consumer.connect();
  await consumer.subscribe({ topics: [config.kafka.dlqTopic] });

  let lastActivity = Date.now();
  await consumer.run({
    eachMessage: async ({ topic, partition, message }) => {
      lastActivity = Date.now();
      if (Number(message.timestamp) >= startedAt) {
        // Newer than this run: stop this partition without committing it.
        consumer.pause([{ topic, partitions: [partition] }]);
        return;
      }
      summary[await replayDeadLetter(producer, message.value, message.headers)] += 1;
      await consumer.commitOffsets([{ topic, partition, offset: String(Number(message.offset) + 1) }]);
    },
  });

  while (Date.now() - lastActivity < IDLE_MS) {
    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }
  console.log(JSON.stringify(summary));
  process.exitCode = summary.requeued > 0 ? 1 : 0;
} finally {
  await consumer.disconnect();
  await producer.disconnect();
  await queryClient.end({ timeout: 5 });
}
