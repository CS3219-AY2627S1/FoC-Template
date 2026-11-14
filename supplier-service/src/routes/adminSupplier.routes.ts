/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: claude-sonnet-5), date: 2026-09-29
 * Scope: Router for the admin supplier list and detail endpoints, restricted to admin and super
 *        admin (Phase 2 plan Task 3; SupplierServiceArchitecture.md §7). No requirements,
 *        architecture, schema, or API decisions were made by the AI tool.
 * Author review:
 * Scope (2026-09-29, Claude Code, model: claude-sonnet-5): added POST / with the idempotency-key and
 *        multipart middleware per Phase 2 plan Task 8. No requirements, architecture, schema, or API
 *        decisions were made by the AI tool.
 * Author review:
 * Scope (2026-09-30, Claude Code, model: claude-sonnet-5-5): added PUT /:id per Phase 3 plan Task 7. No
 *        requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review:
 * Scope (2026-09-30, Claude Code, model: claude-sonnet-5-5): added DELETE /:id per Phase 4 plan Task 6. No requirements,
 *        architecture, schema, or API decisions were made by the AI tool.
 * Author review:
 */
import { Router } from 'express';
import {
  type AdminSupplierDependencies,
  createAdminSupplierController,
} from '../controllers/adminSupplier.controller.js';
import { requireIdempotencyKey } from '../middleware/requireIdempotencyKey.js';
import { requireRole } from '../middleware/requireRole.js';
import { uploadPhotos } from '../middleware/uploadPhotos.js';

export function createAdminSupplierRouter(dependencies: AdminSupplierDependencies): Router {
  const controller = createAdminSupplierController(dependencies);
  const router = Router();

  router.use(requireRole('admin', 'super admin'));
  router.get('/', controller.list);
  router.get('/:id', controller.detail);
  // Header check first so an invalid request is rejected before the body is buffered.
  router.post('/', requireIdempotencyKey, uploadPhotos, controller.create);
  // PUT is idempotent by design, so no idempotency middleware (Arch §7.5).
  router.put('/:id', uploadPhotos, controller.update);
  // DELETE is idempotent by design (a repeat returns 404), so no idempotency middleware (Arch §7.5).
  router.delete('/:id', controller.remove);

  return router;
}
