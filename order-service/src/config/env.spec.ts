/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: claude-opus-5-5), date: 2026-11-06
 * Scope: ECS Fargate migration - tests for REDIS_TLS, per George's ECS Fargate plan,
 *        Phase 1 item 5. No requirements, architecture, schema, or API decisions were
 *        made by the AI tool.
 * Author review: George Yeo
 */

import { describe, expect, it } from 'vitest';
import { loadEnv, redisConnectionOptions } from './env.js';

const base = { DATABASE_URL: 'postgresql://u:p@localhost:5432/db' };

describe('redisConnectionOptions', () => {
  it('has no tls option when REDIS_TLS is unset', () => {
    expect(redisConnectionOptions(loadEnv(base))).toEqual({
      host: 'localhost',
      port: 6379,
    });
  });

  it('has no tls option when REDIS_TLS is "false"', () => {
    expect(
      redisConnectionOptions(loadEnv({ ...base, REDIS_TLS: 'false' })),
    ).not.toHaveProperty('tls');
  });

  it('adds tls when REDIS_TLS is "true"', () => {
    expect(
      redisConnectionOptions(
        loadEnv({ ...base, REDIS_HOST: 'cache', REDIS_TLS: 'true' }),
      ),
    ).toEqual({ host: 'cache', port: 6379, tls: {} });
  });

  it('rejects any other REDIS_TLS value at boot', () => {
    expect(() => loadEnv({ ...base, REDIS_TLS: 'yes' })).toThrow(/REDIS_TLS/);
  });
});
