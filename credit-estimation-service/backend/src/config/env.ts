// AI Assistance Disclosure:
// Tool: OpenCode (Qwen3-Coder-Next)
// Date: 2026-10-25
// Scope: Implemented parsing and validation for author-defined estimation configuration, referencing compose yaml file.
// Author review: Reviewed outputs, corrected phrasing and syntax, and adjusted implementation
// details to fit project requirements.

const positiveInteger = (value: string | undefined, fallback: number): number => {
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback
}

const temperature = (value: string | undefined): number => {
  if (value === undefined || value.trim() === '') return 0
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 2) {
    throw new Error('AI_TEMPERATURE must be a number between 0 and 2')
  }
  return parsed
}

export type EstimationEnv = {
  nodeEnv: string
  port: number
  userApiUrl: string
  userServiceInternalToken: string
  internalServiceToken: string
  serviceTimeoutMs: number
  aiProvider: string
  aiApiKey: string
  aiModel: string
  aiEndpoint: string
  aiTemperature: number
  aiMaxTokens: number
  aiEstimationTimeoutMs: number
  aiRateLimitRequestsPerMinute: number
  aiGlobalRateLimitRequestsPerMinute: number
  redisUrl: string
}

export function getEnv(): EstimationEnv {
  return {
    nodeEnv: process.env.NODE_ENV ?? 'development',
    port: positiveInteger(process.env.PORT, 3005),
    userApiUrl: process.env.USER_API_URL ?? 'http://user-api:3000',
    userServiceInternalToken: process.env.USER_SERVICE_INTERNAL_TOKEN ?? '',
    internalServiceToken: process.env.CREDIT_ESTIMATION_SERVICE_TOKEN ?? '',
    serviceTimeoutMs: positiveInteger(process.env.ESTIMATION_SERVICE_TIMEOUT_MS, 5000),
    aiProvider: process.env.AI_PROVIDER || '',
    aiApiKey: process.env.AI_API_KEY || '',
    aiModel: process.env.AI_MODEL || '',
    aiEndpoint: process.env.AI_ENDPOINT || '',
    aiTemperature: temperature(process.env.AI_TEMPERATURE),
    aiMaxTokens: positiveInteger(process.env.AI_MAX_TOKENS, 1000),
    aiEstimationTimeoutMs: positiveInteger(process.env.AI_ESTIMATION_TIMEOUT_MS, 3000),
    aiRateLimitRequestsPerMinute: positiveInteger(
      process.env.AI_RATE_LIMIT_REQUESTS_PER_MINUTE,
      20,
    ),
    aiGlobalRateLimitRequestsPerMinute: positiveInteger(
      process.env.AI_GLOBAL_RATE_LIMIT_REQUESTS_PER_MINUTE,
      300,
    ),
    redisUrl: process.env.REDIS_URL || 'redis://redis:6379',
  }
}
