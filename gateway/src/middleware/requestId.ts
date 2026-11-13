// AI Assistance Disclosure:
// Tool: ChatGPT (model: GPT-5.6 Luna), date: 2026-09-30
// Scope: Generated the initial implementation of the request ID middleware
// based on the finalized Phase 3 Gateway design.
// Author review: Reviewed and validated against the finalized project design.

import { randomUUID } from "crypto";
import type { NextFunction, Request, Response } from "express";

export const requestIdMiddleware = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  const incomingRequestId = req.header("X-Request-Id");

  const requestId =
    incomingRequestId && incomingRequestId.trim().length > 0
      ? incomingRequestId.trim()
      : randomUUID();

  req.requestId = requestId;
  req.headers["x-request-id"] = requestId;
  res.setHeader("X-Request-Id", requestId);

  next();
};