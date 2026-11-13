/*
 * AI Assistance Disclosure:
 * Tool: ChatGPT (model: GPT-6 Sol), date: 2026-10-28
 * Scope: Generated implementation for authentication routes
 * Author review: Verified all endpoints have correct middleware and correct role access.
 */

import { Router } from 'express'
import { AuthController } from '../controllers/auth.controller.js'
import {
  userAuthMiddleware,
  userAuthSuperAdminMiddleware,
} from '@relay/user-auth-backend-middleware'
import { requireSameOrigin } from '../middleware/origin.middleware.js'
export function createAuthRouter(controller = new AuthController()): Router {
  const router = Router()
  router.post('/register', requireSameOrigin, controller.register)
  router.post('/verification/resend', requireSameOrigin, controller.resend)
  router.post('/verification/confirm-and-login', requireSameOrigin, controller.verify)
  router.post('/login', requireSameOrigin, controller.login)
  router.post('/refresh', requireSameOrigin, controller.refresh)
  router.post('/logout', requireSameOrigin, controller.logout)
  router.get('/me', userAuthMiddleware, controller.me)
  router.post('/password', requireSameOrigin, userAuthMiddleware, controller.changePassword)
  router.post('/admin/promote', requireSameOrigin, userAuthSuperAdminMiddleware, controller.promote)
  router.post('/admin/demote', requireSameOrigin, userAuthSuperAdminMiddleware, controller.demote)
  return router
}
