// AI Assistance Disclosure: Claude Opus (Cursor), 2026-11-05.
// Prompt: improve index.ts to ensure supplier/order pub-sub works for the supplier cache.
// Scope: optional REDIS_URL and SUPPLIER_CACHE_TTL_SECONDS.
// Author review: Keeping env.ts consistent for tests by @sunpterodactyl.
// ChatGPT (Codex), 2026-11-02: Optional User-event subscription URL; review pending; see ../../usage-log.md.
// AI Assistance Disclosure: ChatGPT (Codex), 2026-10-22.
// Scope: Generated setup implementation following approved User Service conventions.
// Author review: Pending; see ../../usage-log.md.
import 'dotenv/config';
import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  DATABASE_URL: z.url().refine((value) => /^postgres(ql)?:\/\//.test(value), 'Expected a PostgreSQL URL'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3003),
  GRPC_HOST: z.string().min(1).default('0.0.0.0'),
  GRPC_PORT: z.coerce.number().int().min(1).max(65535).default(50053),
  GRPC_TIMEOUT_MS: z.coerce.number().int().positive().default(3000),
  USER_SERVICE_PUBLIC_KEY_PATH: z.string().min(1).optional(),
  CREDIT_ORDER_SERVICE_TOKEN: z.string().trim().min(1).optional(),
  RABBITMQ_URL: z.string().min(1).optional(),
  REDIS_URL: z.string().min(1).optional(),
  SUPPLIER_CACHE_TTL_SECONDS: z.coerce.number().int().positive().max(86_400).default(600), //10 min TTL for supplier cache cos no warm caching
  USER_GRPC_ADDR: z.string().min(1).default('localhost:50051'),
  ORDER_GRPC_ADDR: z.string().min(1).default('localhost:50053'),
  CREDIT_GRPC_ADDR: z.string().min(1).default('localhost:50054'),
  SUPPLIER_GRPC_ADDR: z.string().min(1).default('localhost:50052'),
});

export const env = schema.parse(process.env);
