/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: claude-opus-5-5), date: 2026-11-06
 * Scope: ECS Fargate migration - checks DB_SSL reaches the mysql2 pool, per George's ECS Fargate plan,
 *        Phase 1 item 3. No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review: George Yeo
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

const createPool = vi.hoisted(() => vi.fn(() => ({})));
vi.mock('mysql2/promise', () => ({ default: { createPool } }));

async function poolOptionsWith(dbSsl: string | undefined): Promise<{ ssl?: unknown }> {
  vi.resetModules();
  createPool.mockClear();
  if (dbSsl !== undefined) vi.stubEnv('DB_SSL', dbSsl);
  await import('../../src/db/pool.js');
  return (createPool.mock.calls as unknown as [{ ssl?: unknown }][])[0]![0];
}

describe('DB_SSL', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('leaves TLS off when unset', async () => {
    expect(await poolOptionsWith(undefined)).not.toHaveProperty('ssl');
  });

  it('leaves TLS off when "false"', async () => {
    expect(await poolOptionsWith('false')).not.toHaveProperty('ssl');
  });

  it('verifies both the certificate chain and the hostname when "true"', async () => {
    expect((await poolOptionsWith('true')).ssl).toEqual({
      rejectUnauthorized: true,
      verifyIdentity: true,
    });
  });
});
