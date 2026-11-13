// AI Assistance Disclosure:
// Tool: OpenCode (Qwen3-Coder-Next)
// Date: 2026-10-26
// Scope: Scaffolded the estimation application from the author-designed service boundary.
// Author review: Reviewed outputs, corrected phrasing and syntax, and adjusted implementation
// details to fit project requirements.

import express, { type ErrorRequestHandler } from 'express'
import { Redis } from 'ioredis'
import { getEnv } from './config/env.js'
import { translateEstimationError } from './types/estimation.types.js'
import { createEstimationRouter, initializeAIClient } from './routes/estimation.routes.js'
import { internalServiceAuth } from './middleware/internal.middleware.js'
import { cleanupAIClient } from './clients/ai.client.js'
import { assertAllServiceTypesHaveBaselines } from './validators/baseline.validator.js'

export async function createApp() {
  assertAllServiceTypesHaveBaselines()

  const app = express()

  app.use(express.json())

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok' })
  })

  const env = getEnv()
  // A dedicated, bounded connection keeps readiness independent of AI setup.
  const redisHealth = new Redis(env.redisUrl, {
    lazyConnect: true,
    connectTimeout: 1000,
    maxRetriesPerRequest: 0,
    enableOfflineQueue: false,
  })
  redisHealth.on('error', () => {})
  app.get('/healthz', async (_req, res) => {
    try {
      if (await redisHealth.ping() !== 'PONG') throw new Error('Unexpected Redis response')
      res.json({ status: 'ok', redis: 'connected' })
    } catch {
      res.status(503).json({ status: 'unavailable', redis: 'disconnected' })
    }
  })

  // Initialize AI client once at startup
  await initializeAIClient(env)

  // Internal routes only (authenticated via service token)
  app.use('/internal/estimation', internalServiceAuth)
  app.use('/internal/estimation', createEstimationRouter())

  // Error handler
  const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
    const estimationError = translateEstimationError(err)
    res.status(estimationError.statusCode).json({
      code: estimationError.code,
      message: estimationError.fieldErrors
        ? `${estimationError.message} ${Object.entries(estimationError.fieldErrors)
            .map(([field, message]) => `${field}: ${message}`)
            .join(' ')}`
        : estimationError.message,
    })
  }

  app.use(errorHandler)

  return { app, env, redisHealth }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { app, env, redisHealth } = await createApp()
  const port = env.port

  const server = app.listen(port, () => {
    console.log(`Credit estimation service listening on port ${port}`)
  })

  const shutdown = async () => {
    console.log('Shutting down...')
    await new Promise((resolve, reject) => {
      server.close((err) => {
        if (err) reject(err)
        else resolve(null)
      })
    })
    redisHealth.disconnect()
    await cleanupAIClient()
    process.exit(0)
  }

  process.on('SIGTERM', shutdown)
  process.on('SIGINT', shutdown)
}
