/*
 * AI Assistance Disclosure:
 * Tool: ChatGPT (model: GPT-6 Sol), date: 2026-10-28
 * Scope: Generated implementation for auth service configuration.
 * Author review: Verified correctness and ensured no critical secrets are written here.
 */

import 'dotenv/config'

export type AuthEnv = {
  port: number
  region: string
  endpoint: string
  clientId: string
  poolId: string
  adminGroup: string
  superGroup: string
  cookieSecure: boolean
  kafkaBrokers: string[]
  kafkaAuthMode: 'none' | 'scram'
  kafkaUsername?: string
  kafkaPassword?: string
  kafkaUserEventsTopic: string
  kafkaUserDlqTopic: string
}

export function getEnv(): AuthEnv {
  const port = Number(process.env.PORT ?? '3000')
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid PORT')
  const kafkaAuthMode = process.env.KAFKA_AUTH_MODE ?? 'none'
  if (kafkaAuthMode !== 'none' && kafkaAuthMode !== 'scram') {
    throw new Error('KAFKA_AUTH_MODE must be none or scram')
  }
  return {
    port,
    region: process.env.AWS_DEFAULT_REGION ?? 'us-east-1',
    endpoint: process.env.COGNITO_ENDPOINT_URL ?? process.env.AWS_ENDPOINT_URL ?? 'http://floci:4566',
    clientId: process.env.COGNITO_CLIENT_ID ?? 'test',
    poolId: process.env.COGNITO_USER_POOL_ID ?? 'us-east-1_test',
    adminGroup: process.env.COGNITO_ADMIN_GROUP_NAME ?? 'AdminGroup',
    superGroup: process.env.COGNITO_SUPERADMIN_GROUP_NAME ?? 'SuperAdminGroup',
    cookieSecure: (process.env.COOKIE_SECURE ?? 'true') === 'true',
    kafkaBrokers: (process.env.KAFKA_BROKERS ?? 'kafka:9092').split(',').map((value) => value.trim()).filter(Boolean),
    kafkaAuthMode,
    kafkaUsername: process.env.KAFKA_USERNAME,
    kafkaPassword: process.env.KAFKA_PASSWORD,
    kafkaUserEventsTopic: process.env.KAFKA_TOPIC_USER_EVENTS ?? 'user-events',
    kafkaUserDlqTopic: process.env.KAFKA_TOPIC_USER_DLQ ?? 'user-events-dlq',
  }
}
