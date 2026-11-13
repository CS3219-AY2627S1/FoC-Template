// AI Assistance Disclosure:
// Tool: OpenCode (Qwen3-Coder-Next)
// Date: 2026-10-26
// Scope: Implemented middleware for the author-defined internal authentication behavior.
// Referenced middleware implementation from other internal services for consistency.
// Author review: Reviewed outputs, corrected phrasing and syntax, and adjusted implementation
// details to fit project requirements.

import type { NextFunction, Request, RequestHandler, Response } from 'express'
import { getEnv } from '../config/env'

export function internalServiceAuth(req: Request, res: Response, next: NextFunction) {
  const env = getEnv()
  const token = req.header('x-credit-estimation-service-token') || req.header('x-service-token')
  const userId = req.headers['x-user-id'] as string

  if (!token || token !== env.internalServiceToken) {
    res.status(401).json({
      code: 'UNAUTHENTICATED',
      message: 'Authentication is required.',
    })
    return
  }

  // Attach userId to request for downstream use
  req.headers['x-user-id'] = userId
  next()
}
