// AI Assistance Disclosure:
// Tool: Claude Code (model: claude-opus-5), date: 2026-09-26
//  2026-09-26: Recess iteration - env schema and config object, following the same
//    zod-validated pattern as user-service/src/config.ts.
//    No requirements, architecture, schema, or API decisions were made by the AI tool.
//    Author review: Wee Jean
//  2026-10-19: Week 9 - USER_SERVICE_URL, the origin the JWKS key set is fetched from.
//    No requirements, architecture, schema, or API decisions were made by the AI tool.
//    Author review: Reviewed and verified by Koh Wee Jean, 2026-11-10.
//  2026-10-22: Credit transfer consumer - REDIS_HOST / REDIS_PORT, the broker the
//    transfer worker consumes from. Same shape as the sibling services' env.
//    No requirements, architecture, schema, or API decisions were made by the AI tool.
//    Author review: Reviewed and verified by Koh Wee Jean, 2026-11-10.
//  2026-10-22: Updated a comment's doc path after user-service's docs/local-dev-setup.md
//    was renamed to docs/user-service-instructions.md. No requirements, architecture,
//    schema, or API decisions were made by the AI tool.
//    Author review: Reviewed and verified by Koh Wee Jean, 2026-11-10.
//  2026-11-06: ECS Fargate migration - add DB_SSL (default off) for verified TLS to RDS.
//    Tool: Claude Code (model: claude-opus-5-5). Implements the decision in George's ECS
//    Fargate plan, Phase 1 item 1. No requirements, architecture, schema, or API decisions
//    were made by the AI tool.
//    Author review: Reviewed and verified by Koh Wee Jean, 2026-11-10.
//  2026-11-06: ECS Fargate migration - add REDIS_TLS (default off), per George's ECS Fargate
//    plan, Phase 1 item 5. Tool: Claude Code (model: claude-opus-5-5). No requirements,
//    architecture, schema, or API decisions were made by the AI tool.
//    Author review: Reviewed and verified by Koh Wee Jean, 2026-11-10.

import { z } from 'zod';

const envSchema = z.object({
  PORT: z.coerce.number().int().positive(),
  NODE_ENV: z.enum(['development', 'production', 'test']),

  DB_HOST: z.string().min(1),
  DB_PORT: z.coerce.number().int().positive(),
  DB_NAME: z.string().min(1),
  DB_USER: z.string().min(1),
  DB_PASSWORD: z.string().min(1),
  // "true" requires TLS with a verified server certificate. Off for Compose and CI.
  DB_SSL: z.enum(['true', 'false']).default('false'),

  // Origin of user-service, used only to build the JWKS URL. Same value compose already
  // gives supplier-service.
  USER_SERVICE_URL: z.string().url(),

  // order-redis, the broker order-service publishes credit_transfer jobs to. Validated
  // for the API process too, so a misconfigured broker fails at startup rather than at
  // the first job. Same env-var names the sibling workers use.
  REDIS_HOST: z.string().min(1),
  REDIS_PORT: z.coerce.number().int().positive(),
  // "true" connects to Redis over TLS. Off for Compose and CI.
  REDIS_TLS: z.enum(['true', 'false']).default('false'),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  const details = parsed.error.issues
    .map((issue) => `  ${issue.path.join('.')}: ${issue.message}`)
    .join('\n');
  throw new Error(`Invalid environment configuration:\n${details}`);
}

const env = parsed.data;

export const config = {
  port: env.PORT,
  nodeEnv: env.NODE_ENV,
  db: {
    host: env.DB_HOST,
    port: env.DB_PORT,
    name: env.DB_NAME,
    user: env.DB_USER,
    password: env.DB_PASSWORD,
    ssl: env.DB_SSL === 'true',
  },
  userServiceUrl: env.USER_SERVICE_URL,
  // Published by user-service; see user-service/docs/user-service-instructions.md (Part 2).
  jwksUrl: new URL('/auth/.well-known/jwks.json', env.USER_SERVICE_URL),
  redis: {
    host: env.REDIS_HOST,
    port: env.REDIS_PORT,
    tls: env.REDIS_TLS === 'true',
  },
} as const;
