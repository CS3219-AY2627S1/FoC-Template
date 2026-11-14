// AI Assistance Disclosure:
// Tool: Claude Code (claude-sonnet-5), date: 2026-09-25
// 25/09/2026: Stage 4a - auth router
// Author review:
// 25/09/2026: Stage 5e - verify-otp and resend-otp routes
// Author review:
// 25/09/2026: Stage 6 pre-work - logout no longer uses authenticate
// Author review:
// 25/09/2026: Stage 6b - forgot-password route
// Author review:
// 25/09/2026: Stage 6d - reset-password route
// Author review:
// 2026-10-17: Stage 13b - replace GET /auth/verify with GET /auth/.well-known/jwks.json.
//   Governing decision: instructions.md Stage 13b.
// Author review:
// 2026-11-10: Stage 31c - added POST /auth/unlock (public, no authenticate). Tool: Claude Code
//   (model: claude-sonnet-5). Governing decision: instructions.md Stage 31 ("Backend endpoint"
//   row). No requirements, architecture, schema, or API decisions were made by the AI tool.
// Author review:

import { Router } from 'express';
import * as authController from '../controllers/auth.controller.js';

const router = Router();

router.post('/register', authController.register);
router.post('/login', authController.login);
router.post('/logout', authController.logout);
router.post('/refresh', authController.refresh);
router.post('/verify-otp', authController.verifyOtp);
router.post('/resend-otp', authController.resendOtp);
router.post('/forgot-password', authController.forgotPassword);
router.post('/reset-password', authController.resetPassword);
router.post('/unlock', authController.unlock);
router.get('/.well-known/jwks.json', authController.jwks);

export default router;
