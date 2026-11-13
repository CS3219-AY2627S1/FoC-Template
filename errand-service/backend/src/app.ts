// AI Assistance Disclosure:
// Tool: OpenCode (Qwen3-Coder-Next)
// Date: 2026-10-12
// Scope: Scaffolded Errand lifecycle wiring and integrated the author-designed notification flow.
// Author review: Reviewed every output and substantially revised ordering and implementation details for
// the many author-defined conditions and edge cases.

// AI Assistance Disclosure:
// Tool: ChatGPT (model: GPT-5.6 Luna), date: 2026-10-11
// Scope: Generated initial implementation of the Errand Service application.
// Author review: I validated correctness, edited for domain needs, and debugged as necessary.

import express, { type ErrorRequestHandler } from 'express'
import { ErrandErrors } from '@relay/contracts'
import { getEnv } from './config/env.js'
import { ErrandServiceError } from './types/errand.types.js'
import { sessionMiddleware } from './middleware/session.middleware.js'
import { ErrandRepository } from './repositories/errand.repository.js'
import { ErrandService } from './services/errand.service.js'
import { CreditClient } from './clients/credit.client.js'
import { SupplierClient } from './clients/supplier.client.js'
import { ErrandController } from './controllers/errand.controller.js'
import { createErrandRouter } from './routes/errand.routes.js'
import { internalServiceAuth } from './middleware/internal.middleware.js'
import { createInternalErrandRouter } from './routes/internal-errand.routes.js'
import { PendingErrandWorker } from './workers/pending-errand.worker.js'
import { Kafka, logLevel } from 'kafkajs'
import { UserDeletionConsumer } from './consumers/user-deletion.consumer.js'

export function createApp(isReady: () => boolean = () => true) {
  const app = express()

  app.use(express.json())

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok' })
  })

  app.get('/healthz', (_req, res) => {
    const ready = isReady()
    res.status(ready ? 200 : 503).send(ready ? 'ok\n' : 'Kafka unavailable\n')
  })

  const repository = new ErrandRepository()
  const creditClient = new CreditClient()
  const supplierClient = new SupplierClient()
  const service = new ErrandService(repository, creditClient, supplierClient)
  const controller = new ErrandController(service)
  const errandRouter = createErrandRouter(controller)
  const internalErrandRouter = createInternalErrandRouter(controller)

  app.use('/api/errands', sessionMiddleware, errandRouter)
  app.use('/internal/errands', internalServiceAuth, internalErrandRouter)

  const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
    if (error instanceof ErrandServiceError) {
      res.status(error.statusCode).json({
        code: error.code,
        message: error.message,
        ...(error.fieldErrors ? { fieldErrors: error.fieldErrors } : {}),
      })
      return
    }

    console.error(error)
    res.status(500).json({ code: ErrandErrors.INTERNAL_ERROR, message: 'Internal server error' })
  }

  app.use(errorHandler)
  return app
}

let kafkaReady = process.env.NODE_ENV === 'test'
export const app = createApp(() => kafkaReady)
if (process.env.NODE_ENV !== 'test') {
  const env = getEnv()
  const worker = new PendingErrandWorker(new ErrandRepository())
  const mode = env.kafkaAuthMode
  const kafka = new Kafka({
    clientId: 'errand-service',
    brokers: env.kafkaBrokers,
    logLevel: logLevel.ERROR,
    ...(mode === 'scram'
      ? {
          ssl: true,
          sasl: {
            mechanism: 'scram-sha-512' as const,
            username: env.kafkaUsername!,
            password: env.kafkaPassword!,
          },
        }
      : {}),
  })
  const userDeletionConsumer = new UserDeletionConsumer(new ErrandRepository(), kafka, env)
  let stopping = false
  const startConsumer = async () => {
    while (!stopping) {
      try {
        await userDeletionConsumer.start()
        kafkaReady = true
        return
      } catch (error) {
        kafkaReady = false
        console.error('Errand user-deletion consumer failed to start; retrying:', error)
        await userDeletionConsumer.stop().catch(() => undefined)
        if (!stopping) await new Promise((resolve) => setTimeout(resolve, 3000))
      }
    }
  }
  worker.start()
  void startConsumer()
  const server = app.listen(env.port, () =>
    console.log(`Errand Service listening on port ${env.port}`),
  )
  const shutdown = (signal: string) => {
    stopping = true
    kafkaReady = false
    console.log(`${signal} received; shutting down Errand Service.`)
    worker.stop()
    void userDeletionConsumer.stop().finally(() => server.close(() => process.exit(0)))
  }
  process.once('SIGINT', () => shutdown('SIGINT'))
  process.once('SIGTERM', () => shutdown('SIGTERM'))
}
