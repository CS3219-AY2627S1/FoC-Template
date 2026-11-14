// AI Assistance Disclosure:
// Tool: Claude Code (claude-sonnet-5)
//  2026-09-24: Generated initial implementation as part of Stage 2b
//    Author review: No changes needed.
//  2026-09-25: Stage 5a - OTP config, SMTP optional in development
//    Author review:
//  2026-09-25: Stage 6 pre-work - add OTP resend window config
//    Author review:
//  2026-10-02: Add optional TEST_USER_* env vars for a seeded normal user
//    Author review: Congchen
//  2026-10-17: Stage 13a - per-key env vars (JWT_KEY_ID, optional JWT_PREVIOUS_*) for
//    JWKS-based key rotation. No requirements, architecture, schema, or API decisions were
//    made by the AI tool — see instructions.md Stage 13 for the governing decision.
//    Author review:
//  2026-10-21: Stage 14a - add CREDIT_SERVICE_URL for the credit-allocation outbox relay.
//    No requirements, architecture, schema, or API decisions were made by the AI tool — see
//    instructions.md Stage 14 for the governing decision.
//    Author review:
//  2026-11-04: Stage 18a - add LOGIN_MAX_FAILURES, LOGIN_FAILURE_WINDOW_MINUTES,
//    LOCK_ESCALATION_HOURS and LOCK_ESCALATION_RESET_HOURS for the login lockout and OTP
//    send-escalation. No requirements, architecture, schema, or API decisions were made by the
//    AI tool — see instructions.md Stage 18 for the governing decision.
//    Author review:
//  2026-11-05: Stage 23a - bound ACCESS_TOKEN_TTL_MINUTES (1-15) and REFRESH_TOKEN_TTL_DAYS
//    (1-30). Bounds are the governing decision already recorded in instructions.md Stage 23a;
//    no architecture, schema, or API decision was made by the AI tool.
//    Author review:
//  2026-11-06: ECS Fargate migration - add DB_SSL (default off) for verified TLS to RDS.
//    Tool: Claude Code (model: claude-opus-5-5). Implements the decision in George's ECS
//    Fargate plan, Phase 1 item 1. No requirements, architecture, schema, or API decisions
//    were made by the AI tool.
//    Author review: George Yeo
//  2026-11-09: Stage 27a - add ELEVATION_TOKEN_TTL_MINUTES, bounded 1-15 like
//    ACCESS_TOKEN_TTL_MINUTES. Governing decision: instructions.md Stage 27 (the elevation
//    token table). No requirements, architecture, schema, or API decisions were made by the
//    AI tool.
//    Author review:
//  2026-11-09: Stage 28b (Scheduled Errands) - add USER_ORDER_SERVICE_API_KEY for the new
//    inbound GET /users/worker/:id service-key check. Governing decision: instructions.md
//    Stage 28b. No requirements, architecture, schema, or API decisions were made by the AI
//    tool.
//    Author review:
//  2026-11-10: Stage 31a - add FRONTEND_BASE_URL (must parse as a URL) for the lockout unlock
//    link. Tool: Claude Code (model: claude-fable-5-1). Governing decision: instructions.md
//    Stage 31 (Config table). No requirements, architecture, schema, or API decisions were made
//    by the AI tool.
//    Author review:

import { z } from "zod";

const envSchema = z
  .object({
    PORT: z.coerce.number().int().positive(),
    NODE_ENV: z.enum(["development", "production", "test"]),

    DB_HOST: z.string().min(1),
    DB_PORT: z.coerce.number().int().positive(),
    DB_NAME: z.string().min(1),
    DB_USER: z.string().min(1),
    DB_PASSWORD: z.string().min(1),
    // "true" requires TLS with a verified server certificate. Off for Compose and CI.
    DB_SSL: z.enum(["true", "false"]).default("false"),

    JWT_KEY_ID: z.string().min(1),
    JWT_PRIVATE_KEY_PATH: z.string().min(1),
    JWT_PUBLIC_KEY_PATH: z.string().min(1),
    // Set together only during a key-rotation overlap window (Stage 13).
    JWT_PREVIOUS_KEY_ID: z.string().min(1).optional(),
    JWT_PREVIOUS_PUBLIC_KEY_PATH: z.string().min(1).optional(),
    ACCESS_TOKEN_TTL_MINUTES: z.coerce.number().int().min(1).max(15),
    REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().min(1).max(30),
    ELEVATION_TOKEN_TTL_MINUTES: z.coerce.number().int().min(1).max(15),

    SMTP_HOST: z.string().default(""),
    SMTP_PORT: z.coerce.number().int().positive(),
    SMTP_USER: z.string().default(""),
    SMTP_PASS: z.string().default(""),
    SMTP_FROM: z.string().default(""),

    SUPER_ADMIN_USERNAME: z.string().min(1),
    SUPER_ADMIN_EMAIL: z.string().min(1),
    SUPER_ADMIN_PASSWORD: z.string().min(1),

    // Optional local-dev test user; seeded at startup only when all three are set.
    TEST_USER_USERNAME: z.string().default(""),
    TEST_USER_EMAIL: z.string().default(""),
    TEST_USER_PASSWORD: z.string().default(""),

    OTP_TTL_MINUTES: z.coerce.number().int().positive(),
    OTP_RESEND_COOLDOWN_SECONDS: z.coerce.number().int().positive(),
    OTP_MAX_RESENDS: z.coerce.number().int().positive(),
    OTP_RESEND_WINDOW_MINUTES: z.coerce.number().int().positive(),

    CREDIT_SERVICE_URL: z.string().url(),

    LOGIN_MAX_FAILURES: z.coerce.number().int().positive(),
    LOGIN_FAILURE_WINDOW_MINUTES: z.coerce.number().int().positive(),
    // Comma-separated hours for the 1st, 2nd, 3rd+ escalation (e.g. "1,4,24"), shared by the
    // login lock and the OTP send block.
    LOCK_ESCALATION_HOURS: z
      .string()
      .min(1)
      .refine((value) => value.split(",").every((part) => /^\d+$/.test(part.trim())), {
        message: "Must be a comma-separated list of positive integers",
      }),
    LOCK_ESCALATION_RESET_HOURS: z.coerce.number().int().positive(),

    // Shared secret for order-service's worker lookup (GET /users/worker/:id).
    USER_ORDER_SERVICE_API_KEY: z.string().min(1),

    // Public origin of the frontend; the lockout unlock link (Stage 31) is built on it.
    FRONTEND_BASE_URL: z.string().url(),
  })
  .superRefine((env, ctx) => {
    // SMTP settings may be blank only in development (emails are logged instead).
    if (env.NODE_ENV === "development") return;
    for (const key of [
      "SMTP_HOST",
      "SMTP_USER",
      "SMTP_PASS",
      "SMTP_FROM",
    ] as const) {
      if (env[key].length === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [key],
          message: `Required when NODE_ENV is not 'development'`,
        });
      }
    }
  });

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error("Invalid or missing environment variables:");
  for (const issue of parsed.error.issues) {
    console.error(`  - ${issue.path.join(".")}: ${issue.message}`);
  }
  process.exit(1);
}

const env = parsed.data;

export const config = {
  env: env.NODE_ENV,
  server: {
    port: env.PORT,
  },
  db: {
    host: env.DB_HOST,
    port: env.DB_PORT,
    name: env.DB_NAME,
    user: env.DB_USER,
    password: env.DB_PASSWORD,
    ssl: env.DB_SSL === "true",
  },
  jwt: {
    keyId: env.JWT_KEY_ID,
    privateKeyPath: env.JWT_PRIVATE_KEY_PATH,
    publicKeyPath: env.JWT_PUBLIC_KEY_PATH,
    previousKeyId: env.JWT_PREVIOUS_KEY_ID,
    previousPublicKeyPath: env.JWT_PREVIOUS_PUBLIC_KEY_PATH,
    accessTokenTtlMinutes: env.ACCESS_TOKEN_TTL_MINUTES,
    refreshTokenTtlDays: env.REFRESH_TOKEN_TTL_DAYS,
    elevationTokenTtlMinutes: env.ELEVATION_TOKEN_TTL_MINUTES,
  },
  email: {
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    user: env.SMTP_USER,
    pass: env.SMTP_PASS,
    from: env.SMTP_FROM,
  },
  otp: {
    ttlMinutes: env.OTP_TTL_MINUTES,
    resendCooldownSeconds: env.OTP_RESEND_COOLDOWN_SECONDS,
    maxResends: env.OTP_MAX_RESENDS,
    resendWindowMinutes: env.OTP_RESEND_WINDOW_MINUTES,
  },
  superAdmin: {
    username: env.SUPER_ADMIN_USERNAME,
    email: env.SUPER_ADMIN_EMAIL,
    password: env.SUPER_ADMIN_PASSWORD,
  },
  testUser: {
    username: env.TEST_USER_USERNAME,
    email: env.TEST_USER_EMAIL,
    password: env.TEST_USER_PASSWORD,
  },
  creditService: {
    url: env.CREDIT_SERVICE_URL.replace(/\/$/, ""),
  },
  lock: {
    maxLoginFailures: env.LOGIN_MAX_FAILURES,
    loginFailureWindowMinutes: env.LOGIN_FAILURE_WINDOW_MINUTES,
    escalationHours: env.LOCK_ESCALATION_HOURS.split(",").map((part) => Number(part.trim())),
    escalationResetHours: env.LOCK_ESCALATION_RESET_HOURS,
  },
  userOrderService: {
    apiKey: env.USER_ORDER_SERVICE_API_KEY,
  },
  frontend: {
    // Trailing slash stripped (as for CREDIT_SERVICE_URL) so paths can be appended directly.
    baseUrl: env.FRONTEND_BASE_URL.replace(/\/$/, ""),
  },
} as const;
