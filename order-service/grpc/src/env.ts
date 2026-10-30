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
  USER_GRPC_ADDR: z.string().min(1).default('localhost:50051'),
  ORDER_GRPC_ADDR: z.string().min(1).default('localhost:50053'),
  CREDIT_GRPC_ADDR: z.string().min(1).default('localhost:50054'),
  SUPPLIER_GRPC_ADDR: z.string().min(1).default('localhost:50052'),
});

export const env = schema.parse(process.env);
