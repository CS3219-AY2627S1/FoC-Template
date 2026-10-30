import { Router } from 'express';
import { validate } from '../middleware/validate';
import { authenticate } from '../middleware/authenticate';
import { requireRole } from '../middleware/requireRole';
import { registerSchema } from '../dto/registerDto';
import { loginSchema } from '../dto/loginDto';
import { updateProfileSchema } from '../dto/updateProfileDto';
import * as userController from '../controllers/userController';

export const userRouter = Router();

// POST /users/register
userRouter.post('/register', validate(registerSchema), userController.register);

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

// GET /users
userRouter.get('/', authenticate, requireRole('ADMINISTRATOR'), userController.listUsers);

// GET /users/:id
userRouter.get('/:id', authenticate, requireRole('ADMINISTRATOR'), userController.getUserById);

// POST /users/:id/admin
userRouter.post('/:id/admin', authenticate, requireRole('ADMINISTRATOR'), userController.grantAdmin);

// DELETE /users/:id/admin
userRouter.delete('/:id/admin', authenticate, requireRole('ADMINISTRATOR'), userController.revokeAdmin);
