// AI Assistance Disclosure:
// Tool: OpenCode (Qwen3-Coder-Next)
// Date: 2026-11-10
// Scope: Scaffolded the existing internal authentication behavior referenced
//  from user service and credit service middleware implementation.
// Author review: Checked and refined the scaffold.

import type { RequestHandler } from 'express'
import { getEnv } from '../config/env.js'
import { SupplierErrors } from '@relay/contracts/supplier'
import { SupplierServiceError } from '../types/supplier.types.js'

export const internalServiceAuth: RequestHandler = (req, _res, next) => {
  if (req.header('x-supplier-service-token') !== getEnv().internalServiceToken) {
    next(new SupplierServiceError(SupplierErrors.UNAUTHORIZED, 'Invalid service credentials.', 401))
    return
  }

  next()
}
