/*
 * AI Assistance Disclosure:
 * Tool: ChatGPT (model: GPT-6 Sol), date: 2026-10-16
 * Scope: Generated implementation of createCreditRouter.
 * Author review: Verified correctness.
 */
import { Router } from 'express'
import { CreditController } from '../controllers/credit.controller.js'
import { creditAuthMiddleware } from '../middleware/session.middleware.js'

export function createCreditRouter(controller: CreditController) {
  const router = Router()
  router.get('/', creditAuthMiddleware, controller.viewCredit)
  router.get('/history', creditAuthMiddleware, controller.viewCreditHistory)
  return router
}
