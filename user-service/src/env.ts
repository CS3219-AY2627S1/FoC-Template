// AI Assistance Disclosure:
// Tool: Claude Code (Claude Opus), dates: 2026-09-25 – 2026-10-16
// Scope: AI generated the zod env validation, then added the JWT config and
// key loading, the refresh-token settings and the standardised gRPC port.
// Author review: Author reviewed the code and approved. See
// user-service/ai/usage-log.md, entries 001, 008, 010, 016.
// OpenAI Codex added the author-specified Order Service gRPC address for
// deletion eligibility; entry 031 is pending review.

import 'dotenv/config';
import fs from 'node:fs';
import { z } from 'zod';

// Validate config at boot so we fail fast with a clear message.
const schema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  DATABASE_URL: z.url(),
  PORT: z.coerce.number().int().positive().default(3001),
  GRPC_PORT: z.coerce.number().int().positive().default(50051),
  ORDER_GRPC_ADDR: z.string().min(1).default('localhost:50053'),

  JWT_PRIVATE_KEY_PATH: z.string().min(1),
  JWT_PUBLIC_KEY_PATH: z.string().min(1),
  JWT_EXPIRES_IN: z.string().default('15m'),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(7),
  COOKIE_SECURE: z.enum(['true', 'false']).optional(),

  RABBITMQ_URL: z.string().default('amqp://guest:guest@localhost:5672'),
  OUTBOX_POLL_INTERVAL_MS: z.coerce.number().int().positive().default(1000),
  OUTBOX_BATCH_SIZE: z.coerce.number().int().positive().default(50),

  REDIS_URL: z.string().min(1).default('redis://localhost:6379'),
  OTP_HMAC_KEY_PATH: z.string().min(1),
  REDIS_OTP_LUA: z.string().min(1),

  // How OTP emails are sent: 'smtp' (local Mailpit) or 'ses' (Amazon SES API).
  // SES credentials come from the AWS SDK: IRSA on EKS, AWS_PROFILE locally.
  EMAIL_TRANSPORT: z.enum(['smtp', 'ses']).default('smtp'),
  AWS_REGION: z.string().min(1).default('ap-southeast-1'),

  // SMTP settings (EMAIL_TRANSPORT=smtp). Defaults are local Mailpit (no login).
  SMTP_HOST: z.string().min(1).default('localhost'),
  SMTP_PORT: z.coerce.number().int().positive().default(1025),
  SMTP_SECURE: z.enum(['true', 'false']).default('false').transform((v) => v === 'true'),
  // Empty string counts as unset, so compose can pass an empty default.
  SMTP_USER: z.string().optional().transform((v) => v || undefined),
  SMTP_PASS: z.string().optional().transform((v) => v || undefined),
  SMTP_FROM: z.string().min(1).default('"CampusDash" <no-reply@campusdash.local>'),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  console.error('Invalid environment configuration:');
  console.error(z.flattenError(parsed.error).fieldErrors);
  process.exit(1);
}

export const env = parsed.data;

if (env.SMTP_USER && !env.SMTP_PASS) {
  console.error('SMTP_USER is set but SMTP_PASS is missing.');
  process.exit(1);
}

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

function readOtpKey(filePath: string): Buffer {
  let raw: string;
  try {
    raw = fs.readFileSync(filePath, 'utf8').trim();
  } catch {
    console.error(`Cannot read OTP_HMAC_KEY_PATH at "${filePath}". Generate it with npm run keys:otp.`);
    process.exit(1);
  }
  const key = Buffer.from(raw, 'base64');
  if (key.length !== 32) {
    console.error(`OTP key at "${filePath}" must decode to 32 bytes. Regenerate it with npm run keys:otp.`);
    process.exit(1);
  }
  return key;
}

export const otpKey = readOtpKey(env.OTP_HMAC_KEY_PATH);
