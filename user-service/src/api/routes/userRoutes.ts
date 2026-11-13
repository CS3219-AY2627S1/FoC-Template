// AI Assistance Disclosure:
// Tool: Claude Code (Claude Opus), 2026-09-27 – 2026-10-19; OpenAI Codex,
// 2026-11-02 (Asia/Singapore).
// Scope: AI generated the register, login, /me, admin list, admin get-by-id,
// refresh, PATCH /me and admin grant/revoke routes, then added DELETE /users/me.
// Author review: Author specified the endpoints and access rules, reviewed the
// code, manually tested the deletion route, and approved. See
// user-service/ai/usage-log.md, entries 004, 008, 009, 010, 015, 020, and 025.
// AI declaration: Route map and OTP/password flow design are the author's.
// AI only implemented the wiring (handlers, schemas, middleware).
import { Router } from 'express';
import { validate } from '../middleware/validate';
import { authenticate } from '../middleware/authenticate';
import { requireRole } from '../middleware/requireRole';
import { registerSchema } from '../dto/registerDto';
import { loginSchema } from '../dto/loginDto';
import { updateProfileSchema } from '../dto/updateProfileDto';
import {
  completeResetPasswordSchema,
  registerVerifySchema,
} from '../dto/otpDto';
import * as userController from '../controllers/userController';

export const userRouter = Router();

// POST /users/register — public send: stash pending signup and email an OTP
userRouter.post('/register', validate(registerSchema), userController.register);

// POST /users/register/verify — public complete: consume OTP and create the account
userRouter.post('/register/verify',validate(registerVerifySchema),userController.verifyRegister);

// POST /users/login
userRouter.post('/login', validate(loginSchema), userController.login);

// POST /users/refresh
userRouter.post('/refresh', userController.refresh);

// POST /users/logout
userRouter.post('/logout', userController.logout);

// GET /users/me
userRouter.get('/me', authenticate, userController.getMe);

// PATCH /users/me
userRouter.patch('/me', authenticate, validate(updateProfileSchema), userController.updateMe);

// DELETE /users/me
userRouter.delete('/me', authenticate, userController.deleteMe);

// POST /users/reset-password/request — logged-in send; email comes from the session, not the OTP layer
userRouter.post('/reset-password/request', authenticate, userController.requestResetPassword);

// POST /users/reset-password/verify — logged-in complete; reuses completeForgotPassword
userRouter.post('/reset-password/verify', authenticate, validate(completeResetPasswordSchema), userController.completeResetPassword);

// GET /users
userRouter.get('/', authenticate, requireRole('ADMINISTRATOR'), userController.listUsers);

// GET /users/:id
userRouter.get('/:id', authenticate, requireRole('ADMINISTRATOR'), userController.getUserById);

// POST /users/:id/admin
userRouter.post('/:id/admin', authenticate, requireRole('ADMINISTRATOR'), userController.grantAdmin);

// DELETE /users/:id/admin
userRouter.delete('/:id/admin', authenticate, requireRole('ADMINISTRATOR'), userController.revokeAdmin);
