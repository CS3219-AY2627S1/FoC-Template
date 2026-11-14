/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: claude-sonnet-5), date: 2026-09-29
 * Scope: Implemented Phase 2 Task 6 Idempotency-Key header middleware, as specified in the plan.
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review:
 */
import type { NextFunction, Request, Response } from 'express';
import { AppError } from '../utils/AppError.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** POST /api/v1/admin/suppliers requires an Idempotency-Key UUID header (Arch §7.5). */
export function requireIdempotencyKey(req: Request, _res: Response, next: NextFunction): void {
  const key = req.header('Idempotency-Key');
  if (key === undefined || !UUID.test(key)) {
    next(
      new AppError(400, 'Bad Request', 'A valid Idempotency-Key header (UUID) is required.', {
        details: [{ field: 'Idempotency-Key', location: 'header', message: 'Send a UUID in the Idempotency-Key header.' }],
      }),
    );
    return;
  }
  next();
}
