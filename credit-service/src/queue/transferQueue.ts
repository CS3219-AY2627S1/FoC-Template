// AI Assistance Disclosure:
// Tool: Claude Code (model: claude-opus-5), date: 2026-10-22
//  2026-10-22: Credit transfer consumer - the queue contract agreed with order-service
//    on 2026-10-20 and verified against its producer (commit cb7ed49): queue key,
//    job name, payload shape and the backoff delays. BullMQ 6.3.13 is a team-approved
//    dependency (credit-service-context.md §4).
//    No requirements, architecture, schema, or API decisions were made by the AI tool.
//    Author review: Reviewed and verified by Koh Wee Jean, 2026-11-10.

/**
 * The one place the wire contract with order-service is written down.
 *
 * Everything here is fixed by that contract, not by this service. A change to any
 * constant below silently stops the worker receiving jobs — it would subscribe
 * successfully to a queue nobody publishes to — so these are deliberately not
 * configurable.
 */

/**
 * BullMQ forbids ':' inside a queue name, so a 'queue:<group>:<name>' key is split:
 * everything before the last ':' is the key prefix, the last segment is the name.
 * Same convention as order-service and supplier-service.
 */
export const TRANSFER_QUEUE_KEY = 'queue:credit:transfer';
export const TRANSFER_QUEUE_PREFIX = 'queue:credit';
export const TRANSFER_QUEUE_NAME = 'transfer';

/** The BullMQ job name order-service publishes under. */
export const TRANSFER_TASK_NAME = 'credit_transfer';

/**
 * Attempts the producer sets on every transfer job: one initial plus four retries.
 * Mirrored here so the worker can tell a final failure from a retryable one without
 * assuming what arrived on the job.
 */
export const MAX_ATTEMPTS = 5;

const RETRY_BASE_DELAY_MS = 5_000;
const RETRY_FACTOR = 5;

/**
 * Delay before the next attempt once `attemptsMade` attempts have failed:
 * 5 s, 25 s, 125 s, 625 s.
 *
 * This is load-bearing. The producer sets `backoff: { type: 'custom' }`, which tells
 * BullMQ to ask the *worker* for the delay — there is no delay baked into the job. If
 * this strategy is not registered in the Worker's `settings`, BullMQ has no function
 * to call and the agreed schedule does not happen.
 */
export function backoffStrategy(attemptsMade: number): number {
  return RETRY_BASE_DELAY_MS * RETRY_FACTOR ** (attemptsMade - 1);
}

/**
 * What order-service puts on a credit_transfer job. Exactly two keys.
 *
 * `amount` and the requester are deliberately absent: transferCredits reads both back
 * from the reservation row, so a transfer can only ever move what was actually held
 * (API.md, POST /credits/transfer).
 */
export interface TransferPayload {
  /** The order id. Credit Service keys everything on it. */
  requestId: string;
  courierId: string;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Both ids are UUIDs (context §3). Checked rather than trusted: a malformed payload is
 * a permanent failure, and it is better to dead-letter it here with a clear message
 * than to let Postgres reject the cast four retries later.
 */
export function isTransferPayload(value: unknown): value is TransferPayload {
  const v = value as Partial<TransferPayload> | null;
  return (
    typeof v?.requestId === 'string' &&
    UUID_RE.test(v.requestId) &&
    typeof v.courierId === 'string' &&
    UUID_RE.test(v.courierId)
  );
}
