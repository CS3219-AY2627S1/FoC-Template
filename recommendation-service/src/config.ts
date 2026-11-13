import { z } from "zod";

const EnvSchema = z.object({
    NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
    ROLE: z.enum(["all", "api", "worker"]).default("all"),
    PORT: z.coerce.number().int().positive().default(3006),
    LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),
    USER_SERVICE_URL: z.string().url().default("http://localhost:3001"),
    FEATURE_STORE: z.enum(["memory", "dynamodb"]).default("memory"),
    DYNAMODB_TABLE: z.string().default("supplier_stats"),
    DYNAMODB_ENDPOINT: z.string().url().optional(),
    AWS_REGION: z.string().default("ap-southeast-1"),
    S3_BUCKET: z.string().optional(),
    S3_ENDPOINT: z.string().url().optional(),
    SCORER_WEIGHTS_TABLE: z.string().default("scorer_weights"),
})

const rawEnv = Object.fromEntries(
    Object.entries(process.env).filter(([, value]) => value !== "")
)

const parsed = EnvSchema.safeParse(rawEnv);

if (!parsed.success) {
    console.error("Invalid environment configuration:\n" + z.prettifyError(parsed.error));
    process.exit(1);
}

export const config = parsed.data;
