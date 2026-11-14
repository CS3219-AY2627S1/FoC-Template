// AI Assistance Disclosure:
// Tool: Claude Code (model: claude-opus-5), date: 2026-10-22
//  2026-10-22: Credit transfer consumer - asserts how src/worker/main.ts constructs the
//    BullMQ Worker. Added after a mutation check: deleting `settings: { backoffStrategy }`
//    left tsc and every other test green, because they cover the strategy function but
//    not its registration. The producer publishes backoff { type: 'custom' }, so an
//    unregistered strategy means the agreed delays silently do not happen.
//    No requirements, architecture, schema, or API decisions were made by the AI tool.
//    Author review: Reviewed and verified by Koh Wee Jean, 2026-11-10.

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { redisOptions } from '../../src/queue/redisConnection.js';

/** Options the mocked Worker was constructed with. */
const constructed: { name: string; opts: Record<string, any> }[] = [];

// Stops main.ts opening a real socket on import. The options themselves are asserted
// from the exported `redisOptions`, which is pure.
vi.mock('ioredis', () => ({
  Redis: class {
    on(): this {
      return this;
    }
    disconnect(): void {}
  },
}));

vi.mock('bullmq', async (importOriginal) => {
  const actual = await importOriginal<typeof import('bullmq')>();
  return {
    ...actual,
    // Records the construction and does nothing else, so no Redis connection is opened.
    Worker: class {
      constructor(name: string, _processor: unknown, opts: Record<string, any>) {
        constructed.push({ name, opts });
      }
      on(): this {
        return this;
      }
      async close(): Promise<void> {}
    },
  };
});

beforeAll(async () => {
  vi.spyOn(console, 'log').mockImplementation(() => {});
  await import('../../src/worker/main.js');
});

afterAll(() => {
  vi.restoreAllMocks();
});

describe('the transfer worker is wired to the contract', () => {
  it('constructs exactly one Worker', () => {
    expect(constructed).toHaveLength(1);
  });

  it('subscribes to the agreed queue name and prefix', () => {
    const [worker] = constructed;
    // Getting either wrong is the failure that looks like everything working: the
    // worker connects, reports healthy, and receives nothing for ever.
    expect(worker!.name).toBe('transfer');
    expect(worker!.opts.prefix).toBe('queue:credit');
  });

  it('registers the custom backoff strategy', () => {
    // The producer sets backoff { type: 'custom' }, which makes BullMQ call this.
    // Without it there is no delay function at all.
    const strategy = constructed[0]!.opts.settings?.backoffStrategy;
    expect(strategy).toBeTypeOf('function');
  });

  it('registers a strategy that yields 5 s / 25 s / 125 s / 625 s', () => {
    // Asserts the registered function, not the exported one, so swapping in BullMQ's
    // exponential here would be caught.
    const strategy = constructed[0]!.opts.settings!.backoffStrategy as (n: number) => number;
    expect([1, 2, 3, 4].map(strategy)).toEqual([5_000, 25_000, 125_000, 625_000]);
  });

  it('runs one job at a time', () => {
    expect(constructed[0]!.opts.concurrency).toBe(1);
  });

  it('is given a constructed client, not bare options', () => {
    // BullMQ 6 cannot load ioredis itself under native ESM, so handing it
    // { host, port } leaves the worker permanently erroring instead of consuming.
    const { connection } = constructed[0]!.opts;
    expect(connection).toBeTypeOf('object');
    expect(connection.on).toBeTypeOf('function');
  });

  it('configures the connection to survive a broker outage', () => {
    // BullMQ needs this for its blocking fetch; with a finite limit the worker stops
    // consuming after an outage instead of resuming.
    expect(redisOptions.maxRetriesPerRequest).toBeNull();
    expect(redisOptions.retryStrategy).toBeTypeOf('function');

    // Backs off, then keeps retrying at a ceiling rather than giving up.
    const retry = redisOptions.retryStrategy as (times: number) => number;
    const delays = [1, 2, 10, 100, 10_000].map(retry);
    expect(delays.every((d) => typeof d === 'number' && d > 0)).toBe(true);
    expect(Math.max(...delays)).toBeLessThanOrEqual(10_000);
    // Never returns null/undefined, which is how ioredis is told to stop reconnecting.
    expect(retry(1_000_000)).toBe(10_000);
  });
});
