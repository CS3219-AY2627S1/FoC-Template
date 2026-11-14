/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: claude-opus-5-5), date: 2026-09-23
 * Scope: Project scaffolding / infrastructure only. No requirements,
 *        architecture, schema, or API decisions were made by the AI tool.
 * Author review: george-yeo
 */

import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client.js';

export type { PrismaClient };

/** One client per process: it owns a pg connection pool. */
export function createPrismaClient(databaseUrl: string): PrismaClient {
  return new PrismaClient({
    adapter: new PrismaPg({ connectionString: databaseUrl }),
  });
}
