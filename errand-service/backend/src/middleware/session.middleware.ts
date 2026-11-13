// AI Assistance Disclosure:
// Tool: ChatGPT (model: GPT-5.6 Luna), date: 2026-10-11
// Scope: Generated initial implementation of the Errand Service session middleware.
// Author review: I validated correctness, edited for domain needs, and debugged as necessary.

import type { RequestHandler } from 'express'
import { userAuthMiddleware, type AuthenticatedUser } from '@relay/user-auth-backend-middleware'
import { ErrandErrors } from '@relay/contracts'
import { ErrandServiceError } from '../types/errand.types.js'
const requireVerifiedEmail: RequestHandler = (req, _res, next) => {
  if (!req.user?.emailVerified) {
    next(new ErrandServiceError(ErrandErrors.FORBIDDEN, 'A verified email is required.', 403))
    return
  }
  next()
}
export const sessionMiddleware = [userAuthMiddleware, requireVerifiedEmail]
export function requireUser(req: { user?: AuthenticatedUser }): AuthenticatedUser {
  if (!req.user)
    throw new ErrandServiceError(ErrandErrors.UNAUTHENTICATED, 'Authentication is required.', 401)
  return req.user
}
