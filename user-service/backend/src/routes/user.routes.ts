// AI Assistance Disclosure:
// Tool: ChatGPT (model: GPT-5.6 Luna), date: 2026-09-21
// Scope: Generated initial implementation of the User Service routes.
// Author review: I validated correctness, edited for domain needs, and debugged as necessary.

import { Router } from 'express'
import { userAuthMiddleware } from '@relay/user-auth-backend-middleware'
import { UserController } from '../controllers/user.controller.js'

export function createUserRouter(controller: UserController): Router {
  const router = Router()

  router.post('/check-auth', userAuthMiddleware, controller.checkAuth)
  router.get('/me', userAuthMiddleware, controller.getUser)
  router.patch('/me', userAuthMiddleware, controller.updateUser)
  router.delete('/me', userAuthMiddleware, controller.deleteUser)

  return router
}
