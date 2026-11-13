import dotenv from "dotenv";
import { z } from "zod";

dotenv.config();

const envSchema = z.object({
    PORT: z.coerce.number().int().positive().default(3003),
    NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
    LOG_LEVEL: z.string().default("info"),
    DATABASE_URL: z.string().min(1),
    USER_SERVICE_URL: z.string().url().default("http://localhost:3001"),
    SUPPLIER_SERVICE_URL: z.string().url().default("http://localhost:3002"),
    CREDIT_SERVICE_URL: z.string().url().default("http://localhost:3004"),
    BROKER_URL: z.string().default("amqp://relay:change-me@localhost:5672"),
});

export const config = envSchema.parse(Object.fromEntries(
    Object.entries(process.env).filter(([, value]) => value !== ""),
));
