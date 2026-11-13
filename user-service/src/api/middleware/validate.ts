// AI Assistance Disclosure:
// Tool: Claude Code (Claude Opus), dates: 2026-09-27, 2026-10-14
// Scope: AI generated the validation middleware (09-27); later pointed out
// dropped formErrors and suggested the fix (10-14).
// Author review: Author specified the requirements, reviewed and approved, and
// accepted the bug fix. See user-service/ai/usage-log.md, entries 003 and 015.

import type { RequestHandler } from 'express';
import { z } from 'zod';

// Reusable middleware: validates req.body against a zod schema.
export function validate(schema: z.ZodType): RequestHandler {
  return (req, res, next) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      // fieldErrors: tied to one field. formErrors: about the body as a whole
      // (e.g. unknown keys, "at least one field") — only sent when present.
      const { fieldErrors, formErrors } = z.flattenError(result.error);
      res.status(400).json({
        error: 'Validation failed',
        details: fieldErrors,
        ...(formErrors.length > 0 && { errors: formErrors }),
      });
      return;
    }
    req.body = result.data;
    next();
  };
}
