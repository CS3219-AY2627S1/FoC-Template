// AI Assistance Disclosure:
// Tool: ChatGPT (model: GPT-5.6 Luna), date: 2026-09-21
// Scope: Generated initial implementation of the User Service environment configuration.
// Author review: I validated correctness, edited for domain needs, and debugged as necessary.

import 'dotenv/config'

export type UserServiceEnv = {
  nodeEnv: string
  port: number
  awsEndpointUrl: string
  awsRegion: string
  authMode: 'mock' | 'cognito'
  cognitoUserPoolId: string
  internalServiceToken: string
  s3Endpoint: string
  s3PublicEndpoint: string
  s3Region: string
  s3AccessKeyId?: string
  s3SecretAccessKey?: string
  s3Bucket: string
  s3ForcePathStyle: boolean
  kafkaBrokers: string[]
  kafkaAuthMode: 'none' | 'scram'
  kafkaUsername?: string
  kafkaPassword?: string
  kafkaUserEventsTopic: string
  kafkaUserDlqTopic: string
}

function required(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback
  if (!value) throw new Error(`Missing required environment variable: ${name}`)
  return value
}

export function getEnv(): UserServiceEnv {
  const port = Number(process.env.PORT ?? '3000')
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('PORT must be an integer between 1 and 65535')
  }

  const authMode = process.env.AUTH_MODE ?? 'mock'
  if (authMode !== 'mock' && authMode !== 'cognito') {
    throw new Error('AUTH_MODE must be mock or cognito')
  }
  const kafkaAuthMode = process.env.KAFKA_AUTH_MODE ?? 'none'
  if (kafkaAuthMode !== 'none' && kafkaAuthMode !== 'scram') {
    throw new Error('KAFKA_AUTH_MODE must be none or scram')
  }

  return {
    nodeEnv: process.env.NODE_ENV ?? 'development',
    port,
    awsEndpointUrl: process.env.COGNITO_ENDPOINT_URL ?? process.env.AWS_ENDPOINT_URL ?? 'http://localhost:4566',
    awsRegion: process.env.AWS_DEFAULT_REGION ?? 'us-east-1',
    authMode,
    cognitoUserPoolId: required('COGNITO_USER_POOL_ID', 'us-east-1_test'),
    internalServiceToken: required(
      'INTERNAL_USER_SERVICE_TOKEN',
      'local-internal-user-service-token',
    ),
    s3Endpoint: required('S3_ENDPOINT', 'http://localhost:4566'),
    s3PublicEndpoint: required(
      'S3_PUBLIC_ENDPOINT',
      process.env.S3_ENDPOINT ?? 'http://localhost:4566',
    ),
    s3Region: required('S3_REGION', 'us-east-1'),
    s3AccessKeyId: process.env.S3_ACCESS_KEY_ID,
    s3SecretAccessKey: process.env.S3_SECRET_ACCESS_KEY,
    s3Bucket: required('S3_BUCKET', 'relay-user-profile-images'),
    s3ForcePathStyle: (process.env.S3_FORCE_PATH_STYLE ?? 'true') === 'true',
    kafkaBrokers: (process.env.KAFKA_BROKERS ?? 'kafka:9092').split(',').map((value) => value.trim()).filter(Boolean),
    kafkaAuthMode,
    kafkaUsername: process.env.KAFKA_USERNAME,
    kafkaPassword: process.env.KAFKA_PASSWORD,
    kafkaUserEventsTopic: process.env.KAFKA_TOPIC_USER_EVENTS ?? 'user-events',
    kafkaUserDlqTopic: process.env.KAFKA_TOPIC_USER_DLQ ?? 'user-events-dlq',
  }
}
