/*
 * AI Assistance Disclosure:
 * Tool: ChatGPT (model: GPT-6 Sol), date: 2026-10-17
 * Scope: Generated implementation of createApp.
 * Author review: Verified format matches other services and the backend endpoints all work.
 */
import express, { type ErrorRequestHandler } from 'express'
import { CreditRepository, prisma } from './repositories/credit.repository.js'
import { CreditService } from './services/credit.service.js'
import { CreditController } from './controllers/credit.controller.js'
import { createCreditRouter } from './routes/credit.routes.js'
import { CreditServiceError } from './types/credit.types.js'
import { getEnv } from './config/env.js'
import { timingSafeEqual } from 'node:crypto'

export function createApp(repository = new CreditRepository()) {
  const app = express()
  app.use(express.json())
  app.get('/health', (_req, res) => res.status(200).json({ status: 'ok' }))
  app.get('/healthz', async (_req, res) => {
    try {
      await repository.checkTables()
      res.status(200).json({ status: 'ok', database: 'ok' })
    } catch (error) {
      console.error('Credit database readiness check failed:', error)
      res.status(503).json({ status: 'unavailable', database: 'unavailable' })
    }
  })
  const controller = new CreditController(new CreditService(repository))
  app.post(
    '/internal/credit/reserve',
    (req, res, next) => {
      const expected = Buffer.from(getEnv().creditServiceInternalToken)
      const supplied = Buffer.from(req.header('x-credit-service-token') ?? '')
      if (expected.length !== supplied.length || !timingSafeEqual(expected, supplied)) {
        res.status(401).json({ code: 'UNAUTHENTICATED', message: 'Invalid service token.' })
        return
      }
      next()
    },
    controller.reserveCredit,
  )
  app.use('/api/credit', createCreditRouter(controller))
  const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
    if (error instanceof CreditServiceError) {
      res.status(error.statusCode).json({ code: error.code, message: error.message })
      return
    }
    if (error instanceof SyntaxError) {
      res
        .status(400)
        .json({ code: 'INVALID_REQUEST', message: 'The request body contains invalid JSON.' })
      return
    }
    console.error('Credit API error:', error)
    res.status(500).json({ message: 'An unexpected error occurred.' })
  }
  app.use(errorHandler)
  return app
}

export const app = createApp()

export async function closeAppResources(): Promise<void> {
  await prisma.$disconnect()
}
