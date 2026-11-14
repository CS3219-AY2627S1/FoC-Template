/*
 * AI Assistance Disclosure:
 * Tool: GitHub Copilot SDK in VS Code (model: GPT-5.6 Luna), date: 2026-10-12
 * Scope: Added the BullMQ maintenance worker for automatic request completion
 *        and acceptance-deadline expiry. No requirements, architecture, schema,
 *        or API decisions were made by the AI tool.
 * Author review: tng wen xi
 * Scope (2026-10-12): Ensured signal shutdown exits after closing worker,
 *        queue, and database resources so tsx watch can restart the process.
 * Author review: tng wen xi
 * Scope (2026-10-13): Passed the credit client into maintenance execution so
 *        expiry can release the persisted reservation.
 * Author review: tng wen xi
 * Tool: Claude Code (model: claude-opus-5-5), date: 2026-10-20
 * Scope (2026-10-20): Issue #4 - also runs the outbox relay (1 s scheduler) and the
 *        credit-job worker (reserve/release over HTTP with BullMQ retries, dead-letter on
 *        final failure), mirroring supplier-service's worker; real credit client
 *        (George, 2026-10-20). Maintenance no longer calls credit-service directly.
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review: george-yeo
 * Scope (2026-10-20): Issue #6 - order events from the worker (reservation outcomes,
 *        expiry, auto-completion) are published to Redis pub/sub for the API to emit
 *        (George, 2026-10-20: plain Redis, no extra dependency).
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review: george-yeo
 * Scope (2026-10-20): Also runs the minute-by-minute re-drive of transient
 *        credit_release dead letters (George, 2026-10-20).
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review: george-yeo
 * Tool: Claude Code (model: claude-opus-5-5), date: 2026-10-22
 * Scope (2026-10-22): Observability (George, 2026-10-22) - credit jobs log one JSON line per
 *        attempt (withAttemptLog); when QUEUE_DASHBOARD_PORT is set the worker also serves
 *        a read-only bull-board over every queue on order-redis, including credit-service's
 *        transfer queue.
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review: George Yeo
 * Tool: Claude Code (model: claude-opus-5-5), date: 2026-11-06
 * Scope (2026-11-06): ECS Fargate migration - Redis TLS through redisConnectionOptions,
 *        per George's ECS Fargate plan, Phase 1 item 5.
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review: George Yeo
 * Scope (2026-11-08, Codex, model: GPT-6): Implemented or tested the team-specified order chat delivery and message ID deduplication.
 * Author review: tng wen xi
 * Tool: Claude Code (model: claude-opus-5-5), date: 2026-11-09
 * Scope (2026-11-09): The credit job processor no longer takes the event sink (it no longer settles
 *        reservations; George, 2026-11-09).
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review: George Yeo
 * Scope (2026-11-09): Stage 28 f (instructions.md) - wires up the scheduled-errands worker
 *        (1-second series scheduler), its user/supplier service-key HTTP clients, and its
 *        queue in the dashboard/shutdown lists, mirroring the existing credit-job/outbox-relay
 *        wiring. No requirements, architecture, schema, or API decisions were made by the AI
 *        tool.
 * Author review:
 */

import { Queue, Worker, type Job } from 'bullmq';
import { config as loadDotenv } from 'dotenv';
import { createPrismaClient } from './db/prisma.js';
import { loadEnv, redisConnectionOptions } from './config/env.js';
import { runRequestMaintenance } from './services/orders.service.js';
import { createHttpChatClient } from './clients/chat.client.js';
import { createHttpCreditsClient } from './clients/credits.client.js';
import { createOutboxRepository } from './db/outbox.repository.js';
import { createDeadLetterRepository } from './db/dead-letter.repository.js';
import { createBullJobQueue, splitQueueKey } from './queue/bull-queue.js';
import { CREDIT_QUEUE_KEY, CREDIT_TRANSFER_QUEUE_KEY } from './queue/tasks.js';
import {
  createOutboxRelay,
  OUTBOX_RELAY_QUEUE_KEY,
  startRelay,
} from './worker/outbox-relay.js';
import { withAttemptLog } from './worker/job-attempt-log.js';
import {
  startQueueDashboard,
  type QueueDashboard,
} from './worker/queue-dashboard.js';
import {
  createCreditJobProcessor,
  isFinalFailure,
} from './worker/credit-jobs.js';
import { Redis } from 'ioredis';
import { createRedisEventPublisher } from './realtime/socket-sink.js';
import {
  createReleaseRedrive,
  RELEASE_REDRIVE_QUEUE_KEY,
  startReleaseRedrive,
} from './worker/release-redrive.js';
import { createHttpSuppliersClient } from './clients/suppliers.client.js';
import { createHttpUserClient } from './clients/user.client.js';
import {
  createSeriesWorkerTick,
  SERIES_WORKER_QUEUE_KEY,
  startSeriesWorker,
} from './worker/series-worker.js';

loadDotenv({ quiet: true });

const env = loadEnv();
const connection = redisConnectionOptions(env);
const queueName = 'order-request-maintenance';
const queue = new Queue(queueName, { connection });
const prisma = createPrismaClient(env.DATABASE_URL);
const credits = createHttpCreditsClient(env.CREDIT_SERVICE_URL);
if (!env.CHAT_SERVICE_API_KEY)
  throw new Error('CHAT_SERVICE_API_KEY is required by the order worker');
const chat = createHttpChatClient(
  env.CHAT_SERVICE_URL,
  env.CHAT_SERVICE_API_KEY,
);
const deadLetters = createDeadLetterRepository(prisma);
const redis = new Redis(redisConnectionOptions(env));
const events = createRedisEventPublisher(redis);

// ---- Stage 28 f: scheduled-errands worker ----------------------------------
if (!env.SUPPLIER_ORDER_SERVICE_API_KEY)
  throw new Error(
    'SUPPLIER_ORDER_SERVICE_API_KEY is required by the order worker',
  );
if (!env.USER_ORDER_SERVICE_API_KEY)
  throw new Error('USER_ORDER_SERVICE_API_KEY is required by the order worker');
const seriesWorkerSuppliers = createHttpSuppliersClient(
  env.SUPPLIER_SERVICE_URL,
  fetch,
  undefined,
  env.SUPPLIER_ORDER_SERVICE_API_KEY,
);
const seriesWorkerUsers = createHttpUserClient(
  env.USER_ORDER_SERVICE_URL,
  env.USER_ORDER_SERVICE_API_KEY,
);
const seriesTick = createSeriesWorkerTick({
  prisma,
  users: seriesWorkerUsers,
  suppliers: seriesWorkerSuppliers,
  credits,
  events,
});
const seriesWorker = await startSeriesWorker(connection, seriesTick);

async function processMaintenanceJob(_job: Job): Promise<void> {
  const result = await runRequestMaintenance(prisma, new Date(), events);
  if (result.completed > 0 || result.expired > 0) {
    console.log(
      `Request maintenance: completed ${result.completed}, expired ${result.expired}`,
    );
  }
}

const worker = new Worker(queueName, processMaintenanceJob, {
  connection,
  concurrency: 1,
});

worker.on('error', (error) => {
  console.error('Order maintenance worker error:', error);
});

await queue.upsertJobScheduler(
  'request-maintenance-sweep',
  { every: 60_000 },
  { name: 'request-maintenance-sweep', data: {} },
);

// ---- Issue #4: outbox relay + credit jobs -----------------------------------
const jobQueue = createBullJobQueue(connection);
const relay = await startRelay(
  connection,
  createOutboxRelay({
    outbox: createOutboxRepository(prisma),
    queue: jobQueue,
    deadLetters,
  }),
);

const redrive = await startReleaseRedrive(
  connection,
  createReleaseRedrive({ prisma }),
);

const creditQueue = splitQueueKey(CREDIT_QUEUE_KEY);
const creditWorker = new Worker(
  creditQueue.name,
  withAttemptLog(
    CREDIT_QUEUE_KEY,
    createCreditJobProcessor({ prisma, credits, chat }),
  ),
  { connection, prefix: creditQueue.prefix, concurrency: 1 },
);
creditWorker.on('error', (error) => {
  console.error(`[${CREDIT_QUEUE_KEY}] worker error:`, error);
});
creditWorker.on('failed', (job, error) => {
  if (!job || !isFinalFailure(job, error)) return;
  // Retries exhausted (or not retryable): record it for an administrator.
  void deadLetters
    .insert({
      jobId: String(job.id),
      taskName: job.name,
      payload: job.data,
      errorTrace: error.stack ?? error.message,
      failedAt: new Date(),
    })
    .catch((dlqError: unknown) => {
      console.error(`Could not dead-letter job ${job.id}:`, dlqError);
    });
});

// ---- Queue dashboard (bull-board), opt-in --------------------------------------
let dashboard: QueueDashboard | undefined;
if (env.QUEUE_DASHBOARD_PORT !== undefined) {
  dashboard = await startQueueDashboard(connection, env.QUEUE_DASHBOARD_PORT, [
    { name: queueName }, // maintenance sweep, BullMQ's default prefix
    splitQueueKey(OUTBOX_RELAY_QUEUE_KEY),
    splitQueueKey(CREDIT_QUEUE_KEY),
    splitQueueKey(RELEASE_REDRIVE_QUEUE_KEY),
    splitQueueKey(SERIES_WORKER_QUEUE_KEY),
    splitQueueKey(CREDIT_TRANSFER_QUEUE_KEY), // consumed by credit-service
  ]);
}

let shuttingDown = false;
async function shutdown(signal: NodeJS.Signals): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`${signal} received, shutting down maintenance worker`);
  try {
    // Stop taking new jobs and let the active ones finish.
    await Promise.all([
      worker.close(),
      creditWorker.close(),
      relay.close(),
      redrive.close(),
      seriesWorker.close(),
      dashboard?.close(),
    ]);
    await queue.close();
    await jobQueue.close();
    redis.disconnect();
    await prisma.$disconnect();
  } catch (error) {
    console.error('Failed to shut down maintenance worker cleanly:', error);
    process.exitCode = 1;
  } finally {
    process.exit(process.exitCode ?? 0);
  }
}

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
