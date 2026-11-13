// AI Assistance Disclosure:
// Tool: OpenCode (Qwen3-Coder-Next)
// Date: 2026-10-25
// Scope: Implemented route wiring, validation, and rate-limit middleware for the existing interface.
// Author review: Reviewed outputs, corrected phrasing and syntax, and adjusted implementation
// details to fit project requirements.

import { Router, type Request, type Response } from 'express'
import { translateEstimationError } from '../types/estimation.types'
import { handleEstimateCredit } from '../controllers/estimation.controller'
import { type EstimationEnv } from '../config/env.js'
import { setAIClient, createAIClient, getAIClient, cleanupAIClient } from '../clients/ai.client.js'

const router = Router()
let aiClientInitialized = false

export async function initializeAIClient(env: EstimationEnv): Promise<void> {
  if (aiClientInitialized) {
    return
  }

  let aiClient = undefined
  if (env.aiProvider === 'openai') {
    try {
      aiClient = createAIClient({
        provider: env.aiProvider,
        endpoint: env.aiEndpoint,
        apiKey: env.aiApiKey,
        model: env.aiModel,
        temperature: env.aiTemperature,
        maxTokens: env.aiMaxTokens,
        timeoutMs: env.aiEstimationTimeoutMs,
        rateLimitRequestsPerMinute: env.aiRateLimitRequestsPerMinute,
        globalRateLimitRequestsPerMinute: env.aiGlobalRateLimitRequestsPerMinute,
        redisUrl: env.redisUrl,
      })
      setAIClient(aiClient)
      console.log('AI client initialized successfully')
    } catch (error) {
      console.warn('Failed to create AI client:', error)
    }
  }
  aiClientInitialized = true
}

export async function cleanupAIClientFromRoutes(): Promise<void> {
  await cleanupAIClient()
  aiClientInitialized = false
}

/**
 * Estimate credit value for an errand (internal only)
 * Authenticated via service token, supports per-user rate limiting via x-user-id header
 */
router.post('/estimate-credit', async (req: Request, res: Response) => {
  try {
    const userId = req.headers['x-user-id'] as string
    const { name, description, serviceType, instructions, startAt, expiresAt, availableCredit } =
      req.body

    const result = await handleEstimateCredit({
      name,
      description,
      serviceType,
      instructions,
      startAt,
      expiresAt,
      userId,
      availableCredit,
    })
    res.json(result)
  } catch (error) {
    const err = translateEstimationError(error as Error)
    res.status(err.statusCode).json({
      code: err.code,
      message: err.fieldErrors
        ? `${err.message} ${Object.entries(err.fieldErrors)
            .map(([field, message]) => `${field}: ${message}`)
            .join(' ')}`
        : err.message,
    })
  }
})

export function createEstimationRouter() {
  return router
}
