// AI Assistance Disclosure:
// Tool: ChatGPT (model: GPT-5.6 Luna), date: 2026-09-21
// Scope: Generated initial implementation of the User Service internal-authentication middleware.
// Author review: I validated correctness, edited for domain needs, and debugged as necessary.

import type { RequestHandler } from 'express'
import { getEnv } from '../config/env.js'

export const internalServiceAuth: RequestHandler = (req, res, next) => {
  if (req.header('x-user-service-token') !== getEnv().internalServiceToken) {
    res.status(401).json({
      ok: false,
      error: { code: 'UNAUTHENTICATED', message: 'Invalid service credentials.' },
    })
    return
  }
  next()
}
