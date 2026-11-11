/**
 * AI Assistance Disclosure
 * Tool: Claude Code (Claude Opus 5.5)
 * Scope: Generated the command that replays foc.rating.dlq (npm run replay:dlq).
 * Reviewed by Ngooi Jun Sen.
 */

import { config } from '../config.js';
import { queryClient } from '../database/index.js';
import { replayDeadLetter, type ReplayOutcome } from '../messaging/dlq.js';
import { createKafka } from '../messaging/kafka.js';

// Run inside the rating pod: kubectl exec deploy/rating -- npm run replay:dlq
// Reads the dead-letter topic with its own consumer group, from where the last
// replay stopped. Dead letters written after this run started (including the
// ones it re-queues) are left for the next run, so it always finishes.
const IDLE_MS = Number(process.env.DLQ_IDLE_MS ?? 10_000);
const startedAt = Date.now();
const summary: Record<ReplayOutcome, number> = { replayed: 0, requeued: 0, expired: 0, dropped: 0 };

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
      const { outcome, letter } = await replayDeadLetter(producer, message.value, message.headers);
      summary[outcome] += 1;
      if (outcome === 'expired' || outcome === 'dropped') {
        // Gone from the topic after this, so log everything needed to apply it by hand.
        const headers = Object.fromEntries(
          Object.entries(message.headers ?? {}).map(([name, v]) => [name, String(Array.isArray(v) ? v[0] : v)]),
        );
        console.error(
          JSON.stringify({
            outcome,
            dlq: { partition, offset: message.offset },
            letter: letter ?? { headers, raw: message.value?.toString('utf8') ?? '' },
          }),
        );
      }
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
