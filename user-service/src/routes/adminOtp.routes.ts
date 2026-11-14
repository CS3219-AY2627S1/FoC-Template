// AI Assistance Disclosure:
// Tool: Claude Code (model: claude-sonnet-5), date: 2026-11-09
// Scope: Stage 27a - POST /admin/send-otp, /admin/verify-otp, /admin/resend-otp, behind
//        authenticate + authorize('admin'). No requirements, architecture, schema, or API
//        decisions were made by the AI tool.
// Author review:

import { Router } from 'express';
import * as adminOtpController from '../controllers/adminOtp.controller.js';
import { authenticate } from '../middleware/authenticate.js';
import { authorize } from '../middleware/authorize.js';

const router = Router();

router.post('/send-otp', authenticate, authorize('admin'), adminOtpController.sendOtp);
router.post('/verify-otp', authenticate, authorize('admin'), adminOtpController.verifyOtp);
router.post('/resend-otp', authenticate, authorize('admin'), adminOtpController.resendOtp);

export default router;
