/*
 * AI Assistance Disclosure:
 * Tool: Codex (model: gpt-5.6-luna), date: 2026-09-28
 * Scope: Phase 0 Task 2 config loader; no requirements, architecture, schema, or API decisions made.
 * Author review: Congchen
 * Scope (2026-09-29, Claude Code, model: claude-sonnet-5): added optional PHOTO_STORE_* settings and
 *        the `photoStore` config group per Phase 2 plan Task 1. No requirements, architecture, schema,
 *        or API decisions were made by the AI tool.
 * Author review: Congchen
 * Scope (2026-09-30, Claude Code, model: claude-sonnet-5-5): added the optional MOCK_DOWNSTREAM_FAILURE
 *        setting and the `mockDownstreamFailure` config flag per Phase 4 plan Task 13. No requirements,
 *        architecture, schema, or API decisions were made by the AI tool.
 * Author review: Congchen
 * Scope (2026-11-04, Codex, model: GPT-6): Added validation and default for the team-specified rate limit.
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review: Congchen
 * Scope (2026-11-06, Claude Code, model: claude-opus-5-5): ECS Fargate migration - added DB_SSL (default
 *        off) for verified TLS to RDS, per George's ECS Fargate plan, Phase 1 item 3. No requirements,
 *        architecture, schema, or API decisions were made by the AI tool.
 * Author review: George Yeo
 * Scope (2026-11-06, Claude Code, model: claude-opus-5-5): ECS Fargate migration - added REDIS_TLS
 *        (default off), per George's ECS Fargate plan, Phase 1 item 5. No requirements, architecture,
 *        schema, or API decisions were made by the AI tool.
 * Author review: George Yeo
 * Scope (2026-11-06, Claude Code, model: claude-opus-5-5): ECS Fargate migration - added
 *        PHOTO_STORE_REGION (default us-east-1, which MinIO ignores), per George's ECS Fargate plan,
 *        Phase 1 item 6. No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review: George Yeo
 * Scope (2026-11-09, Claude Code, model: claude-sonnet-5): added SUPPLIER_ORDER_SERVICE_API_KEY,
 *        per instructions.md Stage 28 c1 (order-service worker access to the supplier lookups).
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review:
 * Scope (2026-11-11, Claude Code, model: claude-sonnet-5-5): replaced MOCK_DOWNSTREAM_FAILURE with ORDER_SERVICE_URL and
 *        ORDER_SUPPLIER_SERVICE_API_KEY (worker-only, optional here), per the team contract in chat.
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review:
 */

import { z } from "zod";

const positiveInteger = z.coerce.number().int().positive();

const envSchema = z.object({
  PORT: positiveInteger,
  PER_IP_RATE_LIMIT: positiveInteger.default(30),
  NODE_ENV: z.enum(["development", "production", "test"]),
  DB_HOST: z.string().min(1),
  DB_PORT: positiveInteger,
  DB_NAME: z.string().min(1),
  DB_USER: z.string().min(1),
  DB_PASSWORD: z.string().min(1),
  // "true" requires TLS with a verified server certificate. Off for Compose and CI.
  DB_SSL: z.enum(["true", "false"]).default("false"),
  REDIS_HOST: z.string().min(1),
  REDIS_PORT: positiveInteger,
  // "true" connects to Redis over TLS. Off for Compose and CI.
  REDIS_TLS: z.enum(["true", "false"]).default("false"),
  USER_SERVICE_URL: z.string().min(1),
  // Alternative to a user JWT on GET /suppliers/:id and GET /suppliers/reference/location,
  // for order-service's scheduled-errands worker. Same value as order-service's own secret.
  SUPPLIER_ORDER_SERVICE_API_KEY: z.string().min(1),
  PHOTO_STORE_ENDPOINT: z.string().min(1).optional(),
  PHOTO_STORE_BUCKET: z.string().min(1).optional(),
  PHOTO_STORE_ACCESS_KEY: z.string().min(1).optional(),
  PHOTO_STORE_SECRET_KEY: z.string().min(1).optional(),
  // Required by the S3 SDK. MinIO ignores it, so the default keeps Compose working.
  PHOTO_STORE_REGION: z.string().min(1).default("us-east-1"),
  // Worker only (it exits at startup without them): where and how it calls order-service.
  ORDER_SERVICE_URL: z.string().url().optional(),
  ORDER_SUPPLIER_SERVICE_API_KEY: z.string().min(1).optional(),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error("Invalid environment configuration:");
  for (const issue of parsed.error.issues) {
    console.error(`- ${issue.path.join(".") || "environment"}: ${issue.message}`);
  }
  process.exit(1);
}

const values = parsed.data;

export const config = Object.freeze({
  env: values.NODE_ENV,
  perIpRateLimit: values.PER_IP_RATE_LIMIT,
  server: Object.freeze({ port: values.PORT }),
  db: Object.freeze({
    host: values.DB_HOST,
    port: values.DB_PORT,
    name: values.DB_NAME,
    user: values.DB_USER,
    password: values.DB_PASSWORD,
    ssl: values.DB_SSL === "true",
  }),
  redis: Object.freeze({
    host: values.REDIS_HOST,
    port: values.REDIS_PORT,
    tls: values.REDIS_TLS === "true",
  }),
  userServiceUrl: values.USER_SERVICE_URL,
  supplierOrderServiceApiKey: values.SUPPLIER_ORDER_SERVICE_API_KEY,
  photoStore: Object.freeze({
    endpoint: values.PHOTO_STORE_ENDPOINT,
    bucket: values.PHOTO_STORE_BUCKET,
    accessKey: values.PHOTO_STORE_ACCESS_KEY,
    secretKey: values.PHOTO_STORE_SECRET_KEY,
    region: values.PHOTO_STORE_REGION,
  }),
  orderServiceUrl: values.ORDER_SERVICE_URL,
  orderSupplierServiceApiKey: values.ORDER_SUPPLIER_SERVICE_API_KEY,
});
