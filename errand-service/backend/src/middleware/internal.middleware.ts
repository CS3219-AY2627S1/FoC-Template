// AI Assistance Disclosure:
// Tool: ChatGPT (model: GPT-5.6 Luna), date: 2026-10-11
// Scope: Generated initial implementation of the Errand Service internal authentication middleware.
// Author review: I validated correctness, edited for domain needs, and debugged as necessary.

import type { NextFunction, Request, Response } from 'express'
import { getEnv } from '../config/env.js'
import { SupplierEventErrors } from '@relay/contracts'

export function internalServiceAuth(req: Request, res: Response, next: NextFunction): void {
  const token = req.header('x-errand-service-token')
  const env = getEnv()

  if (!token || token !== env.internalServiceToken) {
    res.status(401).json({
      code: SupplierEventErrors.UNAUTHENTICATED,
      message: 'Invalid service token',
    })
    return
  }

  next()
}
