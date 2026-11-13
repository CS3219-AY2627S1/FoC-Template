/*
 * AI Assistance Disclosure:
 * Tool: ChatGPT (model: GPT-6 Sol), date: 2026-10-17
 * Scope: Generated implementation of getEnv.
 * Author review: Verified Zod schema is correct, and that hardcorded values are not production values.
 */
import 'dotenv/config'
import { z } from 'zod'

const schema = z.object({
  DATABASE_URL: z.string().min(1),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  USER_API_URL: z.string().url().default('http://user-api:3000'),
  USER_API_TIMEOUT: z.coerce.number().int().positive().default(5000),
  USER_SERVICE_INTERNAL_TOKEN: z.string().min(1).default('local-internal-user-service-token'),
  CREDIT_SERVICE_INTERNAL_TOKEN: z.string().min(1),
  KAFKA_BROKERS: z.string().min(1).default('kafka:9092'),
  KAFKA_TOPIC_USER_EVENTS: z.string().min(1),
  KAFKA_TOPIC_USER_DLQ: z.string().min(1),
  KAFKA_TOPIC_ERRAND_EVENTS: z.string().min(1),
  KAFKA_TOPIC_ERRAND_DLQ: z.string().min(1),
})

export function getEnv() {
  const env = schema.parse(process.env)
  return {
    databaseUrl: env.DATABASE_URL,
    port: env.PORT,
    userApiUrl: env.USER_API_URL.replace(/\/$/, ''),
    userApiTimeout: env.USER_API_TIMEOUT,
    userServiceInternalToken: env.USER_SERVICE_INTERNAL_TOKEN,
    creditServiceInternalToken: env.CREDIT_SERVICE_INTERNAL_TOKEN,
    kafkaBrokers: env.KAFKA_BROKERS.split(','),
    kafkaTopics: {
      userEvents: env.KAFKA_TOPIC_USER_EVENTS,
      userDlq: env.KAFKA_TOPIC_USER_DLQ,
      errandEvents: env.KAFKA_TOPIC_ERRAND_EVENTS,
      errandDlq: env.KAFKA_TOPIC_ERRAND_DLQ,
    },
  }
}
