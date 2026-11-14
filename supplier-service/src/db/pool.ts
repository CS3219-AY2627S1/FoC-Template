/*
 * AI Assistance Disclosure:
 * Tool: Codex (model: gpt-5.6-luna), date: 2026-09-28
 * Scope: Generated the mysql2/promise connection pool from the recorded config fields.
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review: Congchen
 * Scope (2026-11-06, Claude Code, model: claude-opus-5-5): ECS Fargate migration - verified TLS to RDS
 *        when DB_SSL is on, per George's ECS Fargate plan, Phase 1 item 3. No requirements, architecture,
 *        schema, or API decisions were made by the AI tool.
 * Author review: George Yeo
 */

import mysql from "mysql2/promise";

import { config } from "../config.js";

export const pool = mysql.createPool({
  host: config.db.host,
  port: config.db.port,
  database: config.db.name,
  user: config.db.user,
  password: config.db.password,
  // mysql2 only checks the certificate's hostname when verifyIdentity is set;
  // rejectUnauthorized alone just checks that a trusted CA issued it.
  ...(config.db.ssl ? { ssl: { rejectUnauthorized: true, verifyIdentity: true } } : {}),
});
