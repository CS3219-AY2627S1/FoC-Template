// AI Assistance Disclosure:
// Tool: Claude Code (model: claude-opus-5), date: 2026-09-26
//  2026-09-26: Recess iteration - async controller wrapper, copied from
//    user-service/src/utils/asyncHandler.ts.
//    No requirements, architecture, schema, or API decisions were made by the AI tool.
//    Author review: Wee Jean

import type { NextFunction, Request, RequestHandler, Response } from 'express';

export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>,
): RequestHandler {
  return (req, res, next) => {
    fn(req, res, next).catch(next);
  };
}
