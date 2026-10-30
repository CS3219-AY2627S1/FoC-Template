import 'dotenv/config';
import fs from 'node:fs';
import { z } from 'zod';

// Validate config at boot so we fail fast with a clear message.
const schema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  DATABASE_URL: z.url(),
  PORT: z.coerce.number().int().positive().default(3001),
  GRPC_PORT: z.coerce.number().int().positive().default(50051),

  JWT_PRIVATE_KEY_PATH: z.string().min(1),
  JWT_PUBLIC_KEY_PATH: z.string().min(1),
  JWT_EXPIRES_IN: z.string().default('15m'),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(7),

  RABBITMQ_URL: z.string().default('amqp://guest:guest@localhost:5672'),
  OUTBOX_POLL_INTERVAL_MS: z.coerce.number().int().positive().default(1000),
  OUTBOX_BATCH_SIZE: z.coerce.number().int().positive().default(50),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  console.error('Invalid environment configuration:');
  console.error(z.flattenError(parsed.error).fieldErrors);
  process.exit(1);
}

export const env = parsed.data;

function readKey(filePath: string, label: string): string {
  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch {
    console.error(
      `Cannot read ${label} at "${filePath}". Generate the keypair (see README) or fix the path.`,
    );
    process.exit(1);
  }
}

export const jwtPrivateKey = readKey(env.JWT_PRIVATE_KEY_PATH, 'JWT_PRIVATE_KEY_PATH');
export const jwtPublicKey = readKey(env.JWT_PUBLIC_KEY_PATH, 'JWT_PUBLIC_KEY_PATH');
