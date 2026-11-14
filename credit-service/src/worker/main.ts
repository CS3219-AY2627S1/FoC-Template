// AI Assistance Disclosure:
// Tool: Claude Code (model: claude-opus-5), date: 2026-10-22
//  2026-10-22: Credit transfer consumer - worker process entry point. A separate
//    process from the API, importing the same src/ tree, mirroring
//    supplier-service/src/worker/main.ts. Consumes queue:credit:transfer and calls the
//    same transferCredits the HTTP route calls.
//    No requirements, architecture, schema, or API decisions were made by the AI tool.
//    Author review: Reviewed and verified by Koh Wee Jean, 2026-11-10.
//  2026-11-06: ECS Fargate migration - pass REDIS_TLS to the connection, per George's ECS
//    Fargate plan, Phase 1 item 5. Tool: Claude Code (model: claude-opus-5-5). No requirements,
//    architecture, schema, or API decisions were made by the AI tool.
//    Author review: Reviewed and verified by Koh Wee Jean, 2026-11-10.

import { Worker } from 'bullmq';
import { config } from '../config.js';
import pool from '../db/pool.js';
import { insertDeadLetter } from '../db/queries/deadLetter.queries.js';
import { createRedisConnection } from '../queue/redisConnection.js';
import {
  TRANSFER_QUEUE_KEY,
  TRANSFER_QUEUE_NAME,
  TRANSFER_QUEUE_PREFIX,
  backoffStrategy,
} from '../queue/transferQueue.js';
import {
  createTransferJobProcessor,
  isFinalFailure,
} from './transferJobProcessor.js';

/**
 * The broker connection (decision 8 — survive the broker being down).
 *
 * Constructed explicitly rather than handed to BullMQ as plain options: BullMQ 6 treats
 * ioredis as an optional peer and cannot require it itself under native ESM. The
 * reconnect behaviour and its logging live in src/queue/redisConnection.ts.
 */
const connection = createRedisConnection(config.redis.host, config.redis.port, config.redis.tls);

const processTransferJob = createTransferJobProcessor({
  insertDeadLetter: (entry) => insertDeadLetter(pool, entry),
});

/**
 * concurrency: 1 (decision 9).
 *
 * Deliberate, not copied. Two reasons. transferCredits takes `FOR UPDATE` on two
 * balance rows inside one transaction, so parallel workers on the same pair of users
 * would queue on Postgres anyway — the parallelism would be in the pool, not in the
 * work. And one job at a time keeps a live demo legible: the log reads in order.
 * Completion volume on a campus errand platform is nowhere near needing more.
 *
 * lockDuration is left at BullMQ's 30 s default. A job that holds its lock longer is
 * treated as stalled and re-run, so the question is whether a transfer can take 30 s.
 * It is four statements and no external call: find the reservation, two guard SELECTs,
 * lock two rows, two UPDATEs, one INSERT, commit. The only way to approach 30 s is
 * waiting on a row lock held by another transaction, which at concurrency 1 within this
 * worker cannot happen, and across the API process would mean a transfer and a
 * reservation for the same user colliding — microseconds, not seconds. Measured during
 * end-to-end verification; see the log entry.
 */
const worker = new Worker(TRANSFER_QUEUE_NAME, processTransferJob, {
  connection,
  prefix: TRANSFER_QUEUE_PREFIX,
  concurrency: 1,
  // The producer publishes jobs with `backoff: { type: 'custom' }`, which makes BullMQ
  // ask *this* worker for the delay. Without this line there is no delay function and
  // the agreed 5/25/125/625 s schedule does not happen.
  settings: { backoffStrategy },
});

// Connection-level failures arrive here. Logging them (rather than leaving the event
// unhandled) is what keeps a broker outage from taking the process down: ioredis keeps
// reconnecting underneath, and the worker resumes on its own.
worker.on('error', (error) => {
  console.error(`[${TRANSFER_QUEUE_KEY}] worker error: ${error.message}`);
});

worker.on('failed', (job, error) => {
  const attempts = job?.opts.attempts ?? '?';
  console.error(
    `[${TRANSFER_QUEUE_KEY}] job ${job?.id ?? 'unknown'} attempt ` +
      `${job?.attemptsMade ?? '?'}/${attempts} failed: ${error.message}` +
      (job && isFinalFailure(job, error) ? ' (final — see dead_letter_jobs)' : ''),
  );
});

worker.on('completed', (job) => {
  console.log(`[${TRANSFER_QUEUE_KEY}] job ${job.id} completed`);
});

console.log(
  `credit-service transfer worker started; consuming ${TRANSFER_QUEUE_KEY} ` +
    `from ${config.redis.host}:${config.redis.port}`,
);

let shuttingDown = false;
async function shutdown(signal: NodeJS.Signals): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`${signal} received; taking no new jobs and finishing the active one.`);
  try {
    // close() stops fetching and waits for the job in progress. A transfer is one short
    // transaction, so this returns quickly; compose allows 30 s.
    await worker.close();
    connection.disconnect();
    await pool.end();
    console.log('credit-service transfer worker stopped');
    process.exit(0);
  } catch (error) {
    console.error('Worker shutdown failed:', error);
    process.exit(1);
  }
}

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => void shutdown(signal));
}
