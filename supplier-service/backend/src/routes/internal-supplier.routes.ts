// AI Assistance Disclosure:
// Tool: OpenCode (Qwen3-Coder-Next)
// Date: 2026-11-10
// Scope: Implemented route wiring for the existing internal Supplier interface.
// Author review: Reviewed outputs, corrected phrasing and syntax, and adjusted implementation
// details to fit project requirements.

import { Router } from 'express'
import { SupplierController } from '../controllers/supplier.controller.js'

export function createInternalSupplierRouter(controller: SupplierController): Router {
  const router = Router()
  router.post('/validate-selection', controller.validateSupplierSelection)
  return router
}
