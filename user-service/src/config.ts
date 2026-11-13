import { z } from "zod";

// Validating the .env entries
const EnvSchema = z.object({
    NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
    PORT: z.coerce.number().int().positive().default(3000),
    LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),
    MONGO_URL: z.string().min(1),
    BROKER_URL: z.string().min(1),
    ORDER_SERVICE_URL: z.url().default("http://localhost:3003"),

    OTP_SECRET: z.string().min(32, "must be at least 32 characters"),
    SMTP_HOST: z.string().min(1),
    SMTP_PORT: z.coerce.number().int().positive(),
    SMTP_SECURE: z.stringbool().default(false),
    SMTP_USER: z.string().optional(),
    SMTP_PASS: z.string().optional(),
    MAIL_FROM: z.string().min(1),

    COOKIE_SECURE: z.stringbool().default(true),

    ADMIN_EMAIL: z.email().trim().toLowerCase(),
    ADMIN_PASSWORD: z.string().min(8, "must be at least 8 characters"),
    ADMIN_USERNAME: z.string().trim().min(3).default("admin"),

    // Fixed student accounts for the final demo, created on start-up when switched on.
    SEED_DEMO_STUDENTS: z.stringbool().default(false),
    SEED_DEMO_PASSWORD: z.string().min(8, "must be at least 8 characters").optional(),
}).refine((env) => !env.SEED_DEMO_STUDENTS || env.SEED_DEMO_PASSWORD, {
    path: ["SEED_DEMO_PASSWORD"],
    message: "is required when SEED_DEMO_STUDENTS is true",
})

// Empty strings count as not set
const rawEnv = Object.fromEntries(
    Object.entries(process.env).filter(([, value]) => value !== "")
)

const parsed = EnvSchema.safeParse(rawEnv);

if (!parsed.success) {
    console.error("Invalid environment configuration:\n" + z.prettifyError(parsed.error));
    process.exit(1);
}

export const config = parsed.data;