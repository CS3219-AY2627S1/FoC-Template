// AI Assistance Disclosure:
// Tool: Claude Code (model: claude-opus-5-5), date: 2026-11-06
//  2026-11-06: ECS Fargate migration - checks DB_SSL reaches the pg pool. Implements the
//    decision in George's ECS Fargate plan, Phase 1 item 1.
//    No requirements, architecture, schema, or API decisions were made by the AI tool.
//    Author review: George Yeo

import { afterEach, describe, expect, it, vi } from 'vitest';

// A fresh import re-reads the env. The pool connects lazily, so nothing here touches a database.
async function poolSslWith(dbSsl: string | undefined): Promise<unknown> {
  vi.resetModules();
  if (dbSsl !== undefined) vi.stubEnv('DB_SSL', dbSsl);
  const { default: pool } = await import('../../src/db/pool.js');
  return (pool as unknown as { options: { ssl?: unknown } }).options.ssl;
}

describe('DB_SSL', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('leaves TLS off when unset', async () => {
    expect(await poolSslWith(undefined)).toBeUndefined();
  });

  it('leaves TLS off when "false"', async () => {
    expect(await poolSslWith('false')).toBeUndefined();
  });

  it('requires a verified certificate when "true"', async () => {
    expect(await poolSslWith('true')).toEqual({ rejectUnauthorized: true });
  });
});
