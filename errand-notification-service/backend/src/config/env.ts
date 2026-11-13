// AI Assistance Disclosure:
// Tool: OpenCode (Qwen3-Coder-Next)
// Date: 2026-11-02
// Scope: Implemented parsing for author-defined topic and id requirements
// Author review: Reviewed outputs, corrected phrasing and syntax, and adjusted implementation
// details to fit project requirements.
export interface NotificationEnv {
  port: number
  kafkaBrokers: string
  kafkaTopicErrandEvents: string
  cognitoUserPoolId: string
  cognitoClientId?: string
  cognitoIssuer: string
}

export function getEnv(): NotificationEnv {
  const port = parseInt(process.env.PORT || '3010', 10)
  const kafkaBrokers = process.env.KAFKA_BROKERS
  const kafkaTopicErrandEvents = process.env.KAFKA_TOPIC_ERRAND_EVENTS || 'errand-events'
  const cognitoUserPoolId = process.env.COGNITO_USER_POOL_ID
  const cognitoClientId = process.env.COGNITO_CLIENT_ID
  const cognitoIssuer = process.env.COGNITO_ISSUER || 'http://floci:4566'

  if (!kafkaBrokers) throw new Error('KAFKA_BROKERS environment variable is required')

  if (!cognitoUserPoolId) {
    throw new Error('COGNITO_USER_POOL_ID environment variable is required')
  }

  return {
    port,
    kafkaBrokers,
    kafkaTopicErrandEvents,
    cognitoUserPoolId,
    cognitoClientId,
    cognitoIssuer,
  }
}
