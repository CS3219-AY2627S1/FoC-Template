/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: claude-sonnet-5), date: 2026-09-27
 * Scope: Generated the me router (PUT /active-view) as specified in
 *        instructions.md Stage 11.
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review: Congchen
 *
 * Tool: Claude Code (model: claude-sonnet-5), date: 2026-09-27
 * Scope: Added GET / as specified in instructions.md Stage 12a.
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review: Congchen
 *
 * Tool: Claude Code (model: claude-sonnet-5), date: 2026-09-27
 * Scope: Added PUT /username as specified in instructions.md Stage 12b.
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review: Congchen
 *
 * Tool: Claude Code (model: claude-sonnet-5), date: 2026-09-27
 * Scope: Added PUT /email as specified in instructions.md Stage 12c.
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review: Congchen
 *
 * Tool: Claude Code (model: claude-sonnet-5), date: 2026-09-27
 * Scope: Added POST /verify-otp and POST /resend-otp as specified in instructions.md Stage 12d.
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review: Congchen
 *
 * Tool: Claude Code (model: claude-sonnet-5), date: 2026-09-27
 * Scope: Added PUT /password and POST /confirm-password-change as specified in
 *        instructions.md Stage 12e.
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review: Congchen
 *
 * Tool: Claude Code (model: claude-sonnet-5-5), date: 2026-11-05
 * Scope: Added GET /bookmarks, PUT /bookmarks/:supplierId and DELETE /bookmarks/:supplierId, per
 *        the 2026-11-05 supplier-bookmarking spec.
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review: Congchen
 * Scope (2026-11-08, Codex, model: GPT-6): Added last-request routes per the spec.
 * No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review: Congchen
 *
 * Tool: Claude Code (model: claude-sonnet-5-5), date: 2026-11-09
 * Scope: Added the team-specified preferred_lang setting (ISO 639-1 subset: en, zh, hi, ta, ms, es, ar; default en), following the active-view flow.
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review: Congchen
 */

import { Router } from 'express';
import * as bookmarksController from '../controllers/bookmarks.controller.js';
import * as lastRequestController from '../controllers/lastRequest.controller.js';
import * as meController from '../controllers/me.controller.js';
import { authenticate } from '../middleware/authenticate.js';

const router = Router();
router.get('/last-request', authenticate, lastRequestController.read);
router.put('/last-request', authenticate, lastRequestController.update);

router.get('/', authenticate, meController.getProfile);
router.put('/active-view', authenticate, meController.updateActiveView);
router.put('/preferred-lang', authenticate, meController.updatePreferredLang);
router.put('/username', authenticate, meController.changeUsername);
router.put('/email', authenticate, meController.changeEmail);
router.post('/verify-otp', authenticate, meController.verifyOtp);
router.post('/resend-otp', authenticate, meController.resendOtp);
router.put('/password', authenticate, meController.changePassword);
router.post('/confirm-password-change', authenticate, meController.confirmPasswordChange);
router.get('/bookmarks', authenticate, bookmarksController.list);
router.put('/bookmarks/:supplierId', authenticate, bookmarksController.add);
router.delete('/bookmarks/:supplierId', authenticate, bookmarksController.remove);

export default router;
