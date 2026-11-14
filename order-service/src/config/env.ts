/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: claude-opus-5-5), date: 2026-09-23
 * Scope: Project scaffolding / infrastructure only. No requirements,
 *        architecture, schema, or API decisions were made by the AI tool.
 * Author review: george-yeo
 * Scope (2026-10-12): Added validated Redis connection settings for the
 *        BullMQ maintenance worker.
 * Author review: tng wen xi
 * Tool: Claude Code (model: claude-opus-5-5), date: 2026-10-20
 * Scope (2026-10-20): Issue #4 - CREDIT_SERVICE_URL for the worker's HTTP credit
 *        client (real client everywhere, George 2026-10-20). Localhost default mirrors
 *        REDIS_HOST's; compose sets the container address.
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review: george-yeo
 * Tool: Claude Code (model: claude-opus-5-5), date: 2026-10-22
 * Scope (2026-10-22): optional QUEUE_DASHBOARD_PORT - the worker serves bull-board only
 *        when it is set (dev compose sets it).
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review: George Yeo
 * Tool: Claude Code (model: claude-opus-5-5), date: 2026-11-06
 * Scope (2026-11-06): ECS Fargate migration - REDIS_TLS (default off) and one shared
 *        builder for Redis connection options, per George's ECS Fargate plan, Phase 1 item 5.
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review: George Yeo
 * Tool: Claude Code (model: claude-opus-5-5), date: 2026-10-23
 * Scope (2026-10-23): SUPPLIER_SERVICE_URL for the create / edit existence check;
 *        localhost default is supplier-service's published port (3004).
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review: George Yeo
 * Scope (2026-11-08, Codex, model: GPT-6): Implemented or tested the team-specified order chat delivery and message ID deduplication.
 * Author review: tng wen xi
 * Tool: Claude Code (model: claude-sonnet-5), date: 2026-11-09
 * Scope: SUPPLIER_ORDER_SERVICE_API_KEY for the scheduled-errands worker's supplier-service
 *        calls, per instructions.md Stage 28 c2. Optional like CHAT_SERVICE_API_KEY: only the
 *        worker uses it. No requirements, architecture, schema, or API decisions were made by
 *        the AI tool.
 * Author review:
 * Scope: USER_ORDER_SERVICE_URL and USER_ORDER_SERVICE_API_KEY for the scheduled-errands
 *        worker's user-service calls, per instructions.md Stage 28 d. Optional like
 *        CHAT_SERVICE_API_KEY: only the worker uses them. No requirements, architecture,
 *        schema, or API decisions were made by the AI tool.
 * Author review:
 * Tool: Claude Code (model: claude-sonnet-5-5), date: 2026-11-11
 * Scope: ORDER_SUPPLIER_SERVICE_API_KEY, the key supplier-service's worker sends to the supplier shut-down endpoint (team decision in chat, 2026-11-11).
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review:
 */

import { z } from 'zod';

/**
 * Every env var the service reads. Validated once at boot; the process exits
 * if anything is missing or malformed. Add new vars here AND to .env.example.
 */
const EnvSchema = z.object({
  NODE_ENV: z
    .enum(['development', 'production', 'test'])
    .default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),
  USER_SERVICE_URL: z
    .url({ protocol: /^https?$/ })
    .default('http://localhost:3001'),
  REDIS_HOST: z.string().min(1).default('localhost'),
  REDIS_PORT: z.coerce.number().int().min(1).max(65535).default(6379),
  /** "true" connects to Redis over TLS. Off for Compose and CI. */
  REDIS_TLS: z.enum(['true', 'false']).default('false'),
  CREDIT_SERVICE_URL: z.url().default('http://localhost:3003'),
  CHAT_SERVICE_URL: z.url().default('http://localhost:3005'),
  CHAT_SERVICE_API_KEY: z.string().min(1).optional(),
  SUPPLIER_SERVICE_URL: z
    .url({ protocol: /^https?$/ })
    .default('http://localhost:3004'),
  /** Same value as supplier-service's own copy; the scheduled-errands worker only. */
  SUPPLIER_ORDER_SERVICE_API_KEY: z.string().min(1).optional(),
  /** Same value as supplier-service's own copy; authenticates its worker's shut-down call. */
  ORDER_SUPPLIER_SERVICE_API_KEY: z.string().min(1).optional(),
  /** Scheduled-errands worker only, for GET /users/worker/:id. */
  USER_ORDER_SERVICE_URL: z
    .url({ protocol: /^https?$/ })
    .default('http://localhost:3001'),
  /** Same value as user-service's own copy; the scheduled-errands worker only. */
  USER_ORDER_SERVICE_API_KEY: z.string().min(1).optional(),
  /** Worker only: serve the bull-board queue dashboard on this port; unset = off. */
  QUEUE_DASHBOARD_PORT: z.coerce.number().int().min(1).max(65535).optional(),
});

export type Env = z.infer<typeof EnvSchema>;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const result = EnvSchema.safeParse(source);
  if (!result.success) {
    throw new Error(`Invalid environment:\n${z.prettifyError(result.error)}`);
  }
  return result.data;
}

/** Connection options for ioredis and BullMQ. `tls: {}` keeps Node's certificate checks on. */
export function redisConnectionOptions(env: Env): {
  host: string;
  port: number;
  tls?: Record<string, never>;
} {
  return {
    host: env.REDIS_HOST,
    port: env.REDIS_PORT,
    ...(env.REDIS_TLS === 'true' ? { tls: {} } : {}),
  };
}
