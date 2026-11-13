// AI Assistance Disclosure:
// Tool: ChatGPT (model: GPT-5.6 Luna), date: 2026-10-11
// Scope: Generated initial implementation of the Errand Service environment configuration.
// Author review: I validated correctness, edited for domain needs, and debugged as necessary.

import 'dotenv/config'

const positiveInteger = (value: string | undefined, fallback: number): number => {
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback
}

export type ErrandEnv = {
  nodeEnv: string
  port: number
  databaseUrl: string
  userApiUrl: string
  supplierApiUrl: string
  creditApiUrl: string
  creditEstimationApiUrl: string
  creditServiceToken: string
  creditEstimationServiceToken: string
  userServiceInternalToken: string
  supplierServiceToken: string
  supplierTimeoutMs: number
  estimationTimeoutMs: number
  internalServiceToken: string
  timeoutMs: number
  kafkaBrokers: string[]
  kafkaAuthMode: 'none' | 'scram'
  kafkaUsername?: string
  kafkaPassword?: string
  kafkaUserEventsTopic: string
  kafkaUserDlqTopic: string
}

export function getEnv(): ErrandEnv {
  const databaseUrl = process.env.DATABASE_URL
  if (!databaseUrl) throw new Error('DATABASE_URL is required')
  const kafkaAuthMode = process.env.KAFKA_AUTH_MODE ?? 'none'
  if (kafkaAuthMode !== 'none' && kafkaAuthMode !== 'scram') {
    throw new Error('KAFKA_AUTH_MODE must be none or scram')
  }

  return {
    nodeEnv: process.env.NODE_ENV ?? 'development',
    port: positiveInteger(process.env.PORT, 3000),
    databaseUrl,
    userApiUrl: process.env.USER_API_URL ?? 'http://user-api:3000',
    supplierApiUrl: process.env.SUPPLIER_API_URL ?? 'http://supplier-api:3000',
    creditApiUrl: process.env.CREDIT_API_URL ?? 'http://credit-api:3000',
    creditEstimationApiUrl:
      process.env.CREDIT_ESTIMATION_API_URL ?? 'http://credit-estimation-api:3005',
    creditServiceToken:
      process.env.CREDIT_SERVICE_INTERNAL_TOKEN ?? 'local-internal-credit-service-token',
    creditEstimationServiceToken:
      process.env.CREDIT_ESTIMATION_SERVICE_TOKEN ?? 'local-internal-estimation-service-token',
    userServiceInternalToken:
      process.env.USER_SERVICE_INTERNAL_TOKEN ?? 'local-internal-user-service-token',
    supplierServiceToken:
      process.env.INTERNAL_SUPPLIER_SERVICE_TOKEN ?? 'local-internal-supplier-service-token',
    supplierTimeoutMs: positiveInteger(process.env.SUPPLIER_SERVICE_TIMEOUT_MS, 5000),
    estimationTimeoutMs: positiveInteger(process.env.ESTIMATION_SERVICE_TIMEOUT_MS, 5000),
    internalServiceToken:
      process.env.INTERNAL_ERRAND_SERVICE_TOKEN ?? 'local-internal-errand-service-token',
    timeoutMs: positiveInteger(process.env.ERRAND_SERVICE_TIMEOUT_MS, 5000),
    kafkaBrokers: (process.env.KAFKA_BROKERS ?? 'kafka:9092')
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean),
    kafkaAuthMode,
    kafkaUsername: process.env.KAFKA_USERNAME,
    kafkaPassword: process.env.KAFKA_PASSWORD,
    kafkaUserEventsTopic: process.env.KAFKA_TOPIC_USER_EVENTS ?? 'user-events',
    kafkaUserDlqTopic: process.env.KAFKA_TOPIC_USER_DLQ ?? 'user-events-dlq',
  }
}
