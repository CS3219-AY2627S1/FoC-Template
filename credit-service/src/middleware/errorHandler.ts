// AI Assistance Disclosure:
// Tool: Claude Code (model: claude-opus-5), date: 2026-09-26
//  2026-09-26: Recess iteration - central error handler.
//    The error response body shape is NOT team-decided; it is pending sign-off -
//    see credit-service/README.md.
//    Author review: Wee Jean

import type { NextFunction, Request, Response } from 'express';
import { AppError } from '../utils/AppError.js';
import { PG_CHECK_VIOLATION, isPgError, pgConstraint } from '../db/queries/credits.queries.js';

export function notFoundHandler(_req: Request, res: Response): void {
  res.status(404).json({ error: { code: 'NOT_FOUND', message: 'No such route.' } });
}

export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  if (err instanceof AppError) {
    res.status(err.status).json({ error: { code: err.code, message: err.message } });
    return;
  }

  // A CHECK constraint firing means a balance invariant was about to be broken - the
  // database refused the write and the transaction rolled back. Surfaced distinctly
  // because it points at a defect in a write path, not at bad input.
  if (isPgError(err, PG_CHECK_VIOLATION)) {
    console.error('Balance invariant violated:', pgConstraint(err), err);
    res.status(500).json({
      error: {
        code: 'BALANCE_INVARIANT_VIOLATION',
        message: 'The operation was rejected by a database constraint and rolled back.',
      },
    });
    return;
  }

  console.error('Unhandled error:', err);
  res.status(500).json({
    error: { code: 'INTERNAL_ERROR', message: 'Internal server error.' },
  });
}
