/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: claude-sonnet-5), date: 2026-09-29
 * Scope: Implemented the lookup router per Phase 2 plan Task 4. No requirements, architecture,
 *        schema, or API decisions were made by the AI tool.
 * Author review:
 */
import { Router } from 'express';
import type { LookupService } from '../business/lookupService.js';
import { createLookupController } from '../controllers/lookup.controller.js';
import { requireRole } from '../middleware/requireRole.js';

export function createLookupRouter(service: LookupService): Router {
  const c = createLookupController(service);
  const router = Router();

  router.use(requireRole('admin', 'super admin'));

  router.post('/faculties', c.createFaculty);
  router.put('/faculties/:id', c.updateFaculty);
  router.delete('/faculties/:id', c.deleteFaculty);

  router.post('/locations', c.createLocation);
  router.put('/locations/:id', c.updateLocation);
  router.delete('/locations/:id', c.deleteLocation);

  router.post('/categories', c.createCategory);
  router.put('/categories/:id', c.updateCategory);
  router.delete('/categories/:id', c.deleteCategory);

  return router;
}
