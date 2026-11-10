/**
 * AI Assistance Disclosure
 * Tool: Claude Code (Claude Opus 5.5), date: 2026-10-01
 * Scope: Credit Service source code, drafted and edited with Claude Code.
 * Reviewed by Don Lee
 */

import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { config } from '../config.js';
import * as schema from './schema.js';

// postgres.js connects lazily, so importing this module never blocks on the DB.
export const queryClient = postgres(config.databaseUrl, {
  max: config.dbPoolMax,
  ssl: config.dbSsl,
});

export const db = drizzle(queryClient, { schema, casing: 'snake_case' });

export type Database = typeof db;
export { schema };
