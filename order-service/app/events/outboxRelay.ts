/**
 * AI Assistance Disclosure:
 * Tool: Claude (Sonnet 5.5), date: 2026-10-19
 * Scope: Background relay that publishes outbox rows to RabbitMQ
 * Author review: Reviewed and tested locally
 *
 * Polls the outbox table and publishes unpublished events in order.
 * - Safe to run on several instances at once (cloud scaling): rows are
 *   claimed with FOR UPDATE SKIP LOCKED, so two instances never send the
 *   same row concurrently.
 * - kick() triggers an immediate flush after a status change so events go
 *   out in milliseconds; the poll interval is only the safety net.
 * - If RabbitMQ is down the API keeps working; events accumulate in the
 *   outbox and are sent when the broker returns.
 */

import { OutboxEvent, sequelize } from "../models/index.ts";
import { close as closeBroker, publishEvent } from "./rabbitmq.ts";
import { env } from "../config/env.ts";

let timer: NodeJS.Timeout | null = null;
let running: Promise<void> | null = null;
let rerun = false;
let stopped = false;
let failing = false; // log only on state changes

interface BatchResult {
  sent: number;
  hadFailure: boolean;
}

async function flushBatch(): Promise<BatchResult> {
  return sequelize.transaction(async (t) => {
    const rows = await OutboxEvent.findAll({
      where: { published_at: null },
      order: [["created_at", "ASC"]],
      limit: env.OUTBOX_BATCH_SIZE,
      lock: t.LOCK.UPDATE,
      skipLocked: true,
      transaction: t,
    });

    let sent = 0;
    for (const row of rows) {
      try {
        await publishEvent(row.payload);
      } catch (err) {

        if (!failing) {
          console.error(`Outbox publish failing, will retry: ${(err as Error).message}`);
          failing = true;
        }
        return { sent, hadFailure: true };
      }
      row.published_at = new Date();
      await row.save({ transaction: t });
      sent += 1;
    }

    if (failing && sent > 0) {
      console.log("Outbox publishing recovered.");
    }
    if (sent > 0 || rows.length === 0) failing = false;
    return { sent, hadFailure: false };
  });
}

async function runLoop(): Promise<void> {
  do {
    rerun = false;
    const { sent, hadFailure } = await flushBatch();
    // A full batch means there may be more waiting
    if (!hadFailure && sent === env.OUTBOX_BATCH_SIZE) rerun = true;
  } while (rerun && !stopped);
}

function run(): Promise<void> {
  if (running) {
    rerun = true; // pick up anything recorded while we were busy
    return running;
  }
  running = runLoop()
    .catch((err: Error) => {
      console.error(`Outbox relay error: ${err.message}`);
    })
    .finally(() => {
      running = null;
    });
  return running;
}

export function start(): void {
  stopped = false;
  timer = setInterval(() => void run(), env.OUTBOX_POLL_MS);
  timer.unref();
  void run();
}

// Call after committing a transaction that recorded an event
export function kick(): void {
  if (!stopped) void run();
}

export async function stop(): Promise<void> {
  stopped = true;
  if (timer) clearInterval(timer);
  if (running) await running;
  await closeBroker();
}
