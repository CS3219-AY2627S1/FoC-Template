/*
 * AI Assistance Disclosure:
 * Tool: ChatGPT (model: GPT-6 Sol), date: 2026-10-28
 * Scope: added userAuthMiddleware and userAuthAdminMiddleware after user auth changes
 * Author review: Verified correctness of non-admin and admin endpoints.
 */

import { Router } from 'express'
import { userAuthMiddleware, userAuthAdminMiddleware } from '@relay/user-auth-backend-middleware'
import { SupplierController } from '../controllers/supplier.controller.js'

export function createSupplierRouter(controller: SupplierController) {
  const router = Router()

  // GET /api/supplier - Get all suppliers (authenticated users only)
  router.get('/', userAuthMiddleware, controller.getAllSuppliers)

  // GET /api/supplier/:id - Get single supplier (authenticated users only)
  router.get('/:id', userAuthMiddleware, controller.getSupplierById)

  // POST /api/supplier - Create supplier (admin only)
  router.post('/', userAuthAdminMiddleware, controller.createSupplier)

  // PUT /api/supplier/:id - Update supplier (admin only)
  router.put('/:id', userAuthAdminMiddleware, controller.updateSupplier)

  // DELETE /api/supplier/:id - Delete supplier (admin only)
  router.delete('/:id', userAuthAdminMiddleware, controller.deleteSupplier)

  return router
}
