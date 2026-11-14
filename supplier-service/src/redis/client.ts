/*
 * AI Assistance Disclosure:
 * Tool: Codex (model: gpt-5.6-luna), date: 2026-09-28
 * Scope: Phase 0 Task 4 Redis scaffold; deferred job/cache workflows only.
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Scope (2026-09-29, Claude Code, model: claude-sonnet-5): changed the ioredis import to the named
 *        `Redis` export to fix a TS2351 under NodeNext; no other change.
 * Author review: Congchen
 * Scope (2026-09-29, Claude Code, model: claude-sonnet-5): set `lazyConnect: true` so importing the app
 *        in tests does not open a Redis connection (Phase 2 plan Task 1). No requirements,
 *        architecture, schema, or API decisions were made by the AI tool.
 * Author review: Congchen
 * Scope (2026-11-06, Claude Code, model: claude-opus-5-5): ECS Fargate migration - optional TLS, per
 *        George's ECS Fargate plan, Phase 1 item 5. No requirements, architecture, schema, or API
 *        decisions were made by the AI tool.
 * Author review: George Yeo
 */

import { Redis } from "ioredis";

import { config } from "../config.js";

const redis = new Redis({
  host: config.redis.host,
  port: config.redis.port,
  lazyConnect: true,
  // `tls: {}` keeps Node's certificate checks on.
  ...(config.redis.tls ? { tls: {} } : {}),
});

export default redis;
