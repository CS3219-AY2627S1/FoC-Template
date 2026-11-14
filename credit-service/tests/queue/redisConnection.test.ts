// AI Assistance Disclosure:
// Tool: Claude Code (model: claude-opus-5-5), date: 2026-11-06
//  2026-11-06: ECS Fargate migration - checks the TLS flag reaches ioredis, per George's ECS
//    Fargate plan, Phase 1 item 5.
//    No requirements, architecture, schema, or API decisions were made by the AI tool.
//    Author review: George Yeo

import { beforeEach, describe, expect, it, vi } from 'vitest';

const constructed = vi.hoisted(() => [] as Record<string, unknown>[]);

vi.mock('ioredis', () => ({
  Redis: class {
    constructor(options: Record<string, unknown>) {
      constructed.push(options);
    }
    on(): this {
      return this;
    }
  },
}));

const { createRedisConnection } = await import('../../src/queue/redisConnection.js');

describe('createRedisConnection', () => {
  beforeEach(() => {
    constructed.length = 0;
  });

  it('has no tls option by default', () => {
    createRedisConnection('cache', 6379);
    expect(constructed[0]).toMatchObject({ host: 'cache', port: 6379 });
    expect(constructed[0]).not.toHaveProperty('tls');
  });

  it('adds tls when asked', () => {
    createRedisConnection('cache', 6379, true);
    expect(constructed[0]).toMatchObject({ host: 'cache', port: 6379, tls: {} });
  });
});
