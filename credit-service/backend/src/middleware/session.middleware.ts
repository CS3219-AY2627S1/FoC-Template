/*
 * AI Assistance Disclosure:
 * Tool: ChatGPT (model: GPT-6 Sol), date: 2026-10-14, 2026-10-28
 * Scope: Generated implementation of this module, added userAuthMiddleware
 * Author review: Verified middleware logic correctness
 */
import type { RequestHandler } from 'express'
import { userAuthMiddleware } from '@relay/user-auth-backend-middleware'
import { CreditServiceError } from '../types/credit.types.js'
const requireVerifiedEmail: RequestHandler = (req, res, next) => {
  if (!req.user?.emailVerified) {
    next(new CreditServiceError('FORBIDDEN', 'A verified email is required.', 403))
    return
  }
  res.locals.creditUserId = req.user.sub
  next()
}
export const creditAuthMiddleware = [userAuthMiddleware, requireVerifiedEmail]
