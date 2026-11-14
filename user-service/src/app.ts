// AI Assistance Disclosure:
// Tool: Claude Code (claude-sonnet-5), date: 2026-09-24
//  Scope: Generated initial implementation as part of Stage 1
//    Author review: No changes needed.
// 25/09/2026: Stage 4a - app setup, middleware, error handler
// Author review:
// 25/09/2026: Stage 4e - super admin bootstrap on startup
// Author review:
// 26/09/2026: Stage 7 - split into a pure app export; bootstrap and listen moved to server.ts
// Author review:
// 27/09/2026: Stage 9 - mount users router at /users
// Author review: New
// 27/09/2026: Stage 11 - mount me router at /users/me, before the users router
// Author review:
// 2026-11-06: Stage 26d - mount the audit log router at /admin/audit-logs.
//   No requirements, architecture, schema, or API decisions were made by the AI tool.
// Author review:
// 2026-11-09: Stage 27a - mount the admin OTP router at /admin.
//   No requirements, architecture, schema, or API decisions were made by the AI tool.
// Author review:
// 2026-11-10: Bug fix - the AppError branch now sets err.cookie (if present) on the response,
//   right after the existing retryAfterSeconds handling, so a service-layer AppError can attach
//   a cookie (the new pendingToken on the 403 ACCOUNT_NOT_VERIFIED case) before any response
//   object was reachable. Tool: Claude Code (model: claude-sonnet-5). Governing decision: bug
//   report + team decisions recorded in this task's conversation (pending-token cookie
//   mechanism). No requirements, architecture, schema, or API decisions were made by the AI tool.
// Author review:
import express, { type NextFunction, type Request, type Response } from 'express';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import { ZodError } from 'zod';
import adminOtpRouter from './routes/adminOtp.routes.js';
import auditLogRouter from './routes/auditLog.routes.js';
import authRouter from './routes/auth.routes.js';
import meRouter from './routes/me.routes.js';
import usersRouter from './routes/users.routes.js';
import { AppError } from './utils/AppError.js';

const app = express();

app.use(cors({ origin: 'http://localhost:5173', credentials: true }));
app.use(express.json());
app.use(cookieParser());

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.use('/auth', authRouter);
// Must precede usersRouter, or its '/:id' route would capture 'me'.
app.use('/users/me', meRouter);
app.use('/users', usersRouter);
app.use('/admin/audit-logs', auditLogRouter);
app.use('/admin', adminOtpRouter);

app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  if (err instanceof AppError) {
    if (err.retryAfterSeconds !== undefined) {
      res.set('Retry-After', String(err.retryAfterSeconds));
    }
    if (err.cookie) {
      res.cookie(err.cookie.name, err.cookie.value, err.cookie.options);
    }
    res.status(err.status).json({ message: err.message, code: err.code });
    return;
  }

  if (err instanceof ZodError) {
    const unrecognizedKeys = err.issues.some((issue) => issue.code === 'unrecognized_keys');
    const message = unrecognizedKeys
      ? 'Request contains unexpected fields'
      : err.issues[0]?.message;
    res.status(400).json({ message, code: 'VALIDATION_ERROR' });
    return;
  }

  if (err instanceof SyntaxError && 'type' in err && err.type === 'entity.parse.failed') {
    res.status(400).json({ message: 'Malformed JSON body', code: 'VALIDATION_ERROR' });
    return;
  }

  console.error(err);
  res.status(500).json({ message: 'Internal server error', code: 'INTERNAL_ERROR' });
});

export default app;
