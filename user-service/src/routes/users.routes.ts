/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: claude-sonnet-5), date: 2026-09-27
 * Scope: Generated the users router (GET /, GET /:id, PUT /:id/status) as specified in
 *        instructions.md Stage 9.
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review: Reviewed and verified by Koh Wee Jean, 2026-11-10.
 *
 * Tool: Claude Code (model: claude-sonnet-5), date: 2026-09-27
 * Scope: Added PUT /:id/role as specified in instructions.md Stage 10.
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review: Reviewed and verified by Koh Wee Jean, 2026-11-10.
 *
 * Tool: Claude Code (model: claude-opus-5), date: 2026-10-19
 * Scope: Added GET /public and GET /public/:id, the public display-name lookup.
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review: Reviewed and verified by Koh Wee Jean, 2026-11-10.
 *
 * Tool: Claude Code (model: claude-sonnet-5), date: 2026-11-04
 * Scope: Added POST /:id/unlock, per instructions.md Stage 18d.
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review: Reviewed and verified by Koh Wee Jean, 2026-11-10.
 *
 * Tool: Claude Code (model: claude-sonnet-5), date: 2026-11-04
 * Scope: Added GET /:id/full-email, per instructions.md Stage 20 (NFR3.1.1). Registered
 *        before GET /:id per the stage's explicit route-order instruction.
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review: Reviewed and verified by Koh Wee Jean, 2026-11-10.
 *
 * Tool: Claude Code (model: claude-sonnet-5), date: 2026-11-06
 * Scope: GET /:id/full-email -> POST /:id/full-email, per instructions.md Stage 26c. Still
 *        registered before GET /:id for the same route-order reason.
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review: Reviewed and verified by Koh Wee Jean, 2026-11-10.
 *
 * Tool: Claude Code (model: claude-sonnet-5), date: 2026-11-09
 * Scope: Added GET /worker/:id, behind authenticateServiceKey instead of
 *        authenticate/authorize, per instructions.md Stage 28b. Registered before
 *        POST /:id/full-email and GET /:id for the same route-order reason as those two.
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review: Reviewed and verified by Koh Wee Jean, 2026-11-10.
 */

import { Router } from 'express';
import * as usersController from '../controllers/users.controller.js';
import { authenticate } from '../middleware/authenticate.js';
import { authenticateServiceKey } from '../middleware/authenticateServiceKey.js';
import { authorize } from '../middleware/authorize.js';

const router = Router();

// Must precede GET /:id, or ':id' captures the literal "public" and fails UUID validation.
// authenticate only: any signed-in user may resolve a display name, no role required.
router.get('/public', authenticate, usersController.listPublic);
router.get('/public/:id', authenticate, usersController.getPublicById);

router.get('/', authenticate, authorize('admin'), usersController.list);
// Must precede GET /:id, per instructions.md Stage 28b's explicit route-order instruction.
// Service-key auth only (order-service's scheduler), not a signed-in user.
router.get('/worker/:id', authenticateServiceKey, usersController.workerStatus);
// Must precede GET /:id, per instructions.md Stage 20's explicit route-order instruction.
router.post('/:id/full-email', authenticate, authorize('admin'), usersController.fullEmail);
router.get('/:id', authenticate, authorize('admin'), usersController.getById);
router.put('/:id/status', authenticate, authorize('admin'), usersController.updateStatus);
router.put('/:id/role', authenticate, authorize('super admin'), usersController.changeRole);
router.post('/:id/unlock', authenticate, authorize('admin'), usersController.unlock);

export default router;
