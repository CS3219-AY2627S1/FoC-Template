/**
 * Periodically marks OPEN orders past accept_by as EXPIRED.
 * One scan runs at a time. A full batch is followed by another scan immediately.
 */

import { env } from "../config/env.ts";
import { kick } from "./outboxRelay.ts";
import { expireDueOpenOrders } from "../service/orderService.ts";

const EXPIRY_BATCH_SIZE = 50;

let timer: NodeJS.Timeout | null = null;
let running: Promise<void> | null = null;
let stopped = false;

async function scan(): Promise<void> {
  let expired = 0;
  do {
    expired = await expireDueOpenOrders(EXPIRY_BATCH_SIZE);
    if (expired > 0) kick();
  } while (!stopped && expired === EXPIRY_BATCH_SIZE);
}

function run(): Promise<void> {
  if (running) return running;
  running = scan()
    .catch((err: Error) => {
      console.error(`Order expiry scan failed, will retry: ${err.message}`);
    })
    .finally(() => {
      running = null;
    });
  return running;
}

export function start(): void {
  stopped = false;
  timer = setInterval(() => void run(), env.EXPIRY_POLL_MS);
  timer.unref();
  void run();
}

export async function stop(): Promise<void> {
  stopped = true;
  if (timer) clearInterval(timer);
  timer = null;
  if (running) await running;
}
