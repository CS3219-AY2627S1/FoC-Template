// AI Assistance Disclosure:
// Tool: Claude Code (model: claude-opus-5), date: 2026-09-26
//  2026-09-26: Recess iteration - pg connection pool, following user-service/src/db/pool.ts.
//    No requirements, architecture, schema, or API decisions were made by the AI tool.
//    Author review: Wee Jean
//  2026-11-06: ECS Fargate migration - verified TLS to RDS when DB_SSL is on.
//    Tool: Claude Code (model: claude-opus-5-5). Implements the decision in George's ECS
//    Fargate plan, Phase 1 item 1. No requirements, architecture, schema, or API decisions
//    were made by the AI tool.
//    Author review: Reviewed and verified by Koh Wee Jean, 2026-11-10.

import pg from 'pg';
import { config } from '../config.js';

// Credits are whole numbers stored as INTEGER, so the default pg parsing (int4 -> number)
// is correct and no custom type parser is needed.
const pool = new pg.Pool({
  host: config.db.host,
  port: config.db.port,
  database: config.db.name,
  user: config.db.user,
  password: config.db.password,
  ssl: config.db.ssl ? { rejectUnauthorized: true } : undefined,
});

export default pool;
