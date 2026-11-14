/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: claude-sonnet-5), date: 2026-09-29
 * Scope: Router for the four requester-mode read endpoints in SupplierServiceArchitecture.md §7,
 *        all open to user, admin and super admin. The static /reference/* routes are registered
 *        before /:id so they are not captured as ids. No requirements, architecture, schema, or API
 *        decisions were made by the AI tool.
 * Author review:
 */
import { Router } from 'express';
import type { SupplierService } from '../business/supplierService.js';
import { createSupplierController } from '../controllers/supplier.controller.js';
import { requireRole } from '../middleware/requireRole.js';

export function createSupplierRouter(service: SupplierService): Router {
  const controller = createSupplierController(service);
  const router = Router();

  router.use(requireRole('user', 'admin', 'super admin'));

  router.get('/', controller.list);
  router.get('/reference/location', controller.locations);
  router.get('/reference/categories', controller.categories);
  router.get('/:id', controller.detail);

  return router;
}
