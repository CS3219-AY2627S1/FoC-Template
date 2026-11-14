// AI Assistance Disclosure:
// Tool: Claude Code (model: claude-opus-5), date: 2026-10-22
//  2026-10-22: Credit transfer consumer - pins the wire contract with order-service
//    (commit cb7ed49) and the backoff delays. These values are not ours to change: a
//    mismatch makes the worker subscribe successfully and receive nothing.
//    No requirements, architecture, schema, or API decisions were made by the AI tool.
//    Author review: Reviewed and verified by Koh Wee Jean, 2026-11-10.

import { describe, expect, it } from 'vitest';
import {
  MAX_ATTEMPTS,
  TRANSFER_QUEUE_KEY,
  TRANSFER_QUEUE_NAME,
  TRANSFER_QUEUE_PREFIX,
  TRANSFER_TASK_NAME,
  backoffStrategy,
  isTransferPayload,
} from '../../src/queue/transferQueue.js';

describe('the queue contract agreed with order-service (2026-10-20)', () => {
  it('uses the agreed queue key, prefix and name', () => {
    expect(TRANSFER_QUEUE_KEY).toBe('queue:credit:transfer');
    expect(TRANSFER_QUEUE_PREFIX).toBe('queue:credit');
    expect(TRANSFER_QUEUE_NAME).toBe('transfer');
  });

  it('splits the key the way order-service splits it', () => {
    // order-service's splitQueueKey: everything before the last ':' is the prefix.
    const at = TRANSFER_QUEUE_KEY.lastIndexOf(':');
    expect(TRANSFER_QUEUE_KEY.slice(0, at)).toBe(TRANSFER_QUEUE_PREFIX);
    expect(TRANSFER_QUEUE_KEY.slice(at + 1)).toBe(TRANSFER_QUEUE_NAME);
  });

  it('uses the agreed job name', () => {
    expect(TRANSFER_TASK_NAME).toBe('credit_transfer');
  });

  it('expects five attempts, matching the producer', () => {
    expect(MAX_ATTEMPTS).toBe(5);
  });
});

describe('the payload guard', () => {
  const requestId = '0192f0c4-0000-7000-8000-00000000000a';
  const courierId = '0192f0c4-0000-7000-8000-00000000000b';

  it('accepts exactly the two keys order-service sends', () => {
    expect(isTransferPayload({ requestId, courierId })).toBe(true);
  });

  it('rejects a missing or non-UUID field', () => {
    expect(isTransferPayload({ requestId })).toBe(false);
    expect(isTransferPayload({ courierId })).toBe(false);
    expect(isTransferPayload({ requestId: 'not-a-uuid', courierId })).toBe(false);
    expect(isTransferPayload({ requestId, courierId: 42 })).toBe(false);
    expect(isTransferPayload(null)).toBe(false);
    expect(isTransferPayload('{}')).toBe(false);
  });

  it('tolerates extra keys, so the producer can add a field without breaking us', () => {
    expect(isTransferPayload({ requestId, courierId, addedLater: true })).toBe(true);
  });
});

describe('the backoff strategy', () => {
  // Load-bearing: the producer sets backoff { type: 'custom' }, so BullMQ asks this
  // function for the delay. If it is wrong, or not registered on the Worker, the
  // agreed schedule silently does not happen.
  it('produces 5 s, 25 s, 125 s, 625 s for the four retries', () => {
    expect(backoffStrategy(1)).toBe(5_000);
    expect(backoffStrategy(2)).toBe(25_000);
    expect(backoffStrategy(3)).toBe(125_000);
    expect(backoffStrategy(4)).toBe(625_000);
  });

  it('is powers of five, not BullMQ exponential', () => {
    // order-service's other queue uses exponential/1 s (1/2/4/8 s). If this worker
    // were handed that schedule the four retries would finish in 15 s instead of
    // ~13 minutes, which is the difference between riding out a restart and not.
    expect(backoffStrategy(2)).not.toBe(2_000);
    expect(backoffStrategy(4)).not.toBe(8_000);
  });

  it('totals about 13 minutes across the four retries', () => {
    const total = [1, 2, 3, 4].reduce((sum, n) => sum + backoffStrategy(n), 0);
    expect(total).toBe(780_000);
  });
});
