// AI Assistance Disclosure:
// Tool: OpenAI Codex (model: GPT-6), dates: 2026-10-20–2026-10-22 (Asia/Singapore).
// Scope: Configured human-specified order-service tokens, local transport, REST port, and User Service public-key path. Implemented/documented the human-decided plaintext-only Credit gRPC transport; service-token and REST JWT authentication retained. Added RabbitMQ URL configuration for the requested user-event startup wiring.
// Refactor: Moved/imports updated for the human-specified src layout (entry 024).
// Author review: I reviewed and edited tokens as necessary throughout the implementation period.
// Prompts and key responses: ../ai/usage-log.md, entries 005–024, 035, 036.

import 'dotenv/config';
import { z } from 'zod';

const schema = z.object({
  GRPC_HOST: z.string().min(1).default('0.0.0.0'),
  GRPC_PORT: z.coerce.number().int().min(1).max(65535).default(50054),
  CREDIT_ORDER_SERVICE_TOKEN: z.string().min(1),
  RABBITMQ_URL: z.string().min(1).default('amqp://guest:guest@localhost:5672'),
  CREDIT_JWT_PUBLIC_KEY_PATH: z.string().min(1).default('../user-service/keys/public.pem'),
  HTTP_HOST: z.string().min(1).default('0.0.0.0'),
  HTTP_PORT: z.coerce.number().int().min(1).max(65535).default(3004),
});

export const env = schema.parse(process.env);
