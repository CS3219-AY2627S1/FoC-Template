/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: claude-opus-5-5), date: 2026-11-06
 * Scope: ECS Fargate migration - checks REDIS_TLS reaches the ioredis client, per George's ECS Fargate
 *        plan, Phase 1 item 5. No requirements, architecture, schema, or API decisions were made by
 *        the AI tool.
 * Author review: George Yeo
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

const constructed = vi.hoisted(() => [] as Record<string, unknown>[]);

vi.mock('ioredis', () => ({
  Redis: class {
    constructor(options: Record<string, unknown>) {
      constructed.push(options);
    }
  },
}));

async function clientOptionsWith(redisTls: string | undefined): Promise<Record<string, unknown>> {
  vi.resetModules();
  constructed.length = 0;
  if (redisTls !== undefined) vi.stubEnv('REDIS_TLS', redisTls);
  await import('../../src/redis/client.js');
  return constructed[0]!;
}

describe('REDIS_TLS', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('has no tls option when unset', async () => {
    expect(await clientOptionsWith(undefined)).not.toHaveProperty('tls');
  });

  it('has no tls option when "false"', async () => {
    expect(await clientOptionsWith('false')).not.toHaveProperty('tls');
  });

  it('adds tls when "true"', async () => {
    expect(await clientOptionsWith('true')).toMatchObject({ tls: {} });
  });
});
