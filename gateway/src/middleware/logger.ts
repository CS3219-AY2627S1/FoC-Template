// AI Assistance Disclosure:
// Tool: ChatGPT (model: GPT-5.6 Luna), date: 2026-09-30
// Scope: Generated the initial implementation of the sanitized request
// logging middleware based on the finalized Phase 3 Gateway design.
// Author review: Reviewed and validated against the finalized project design.

import { type Request, type Response, type NextFunction } from "express";

export const loggerMiddleware = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  const startTime = process.hrtime.bigint();

  res.on("finish", () => {
    const endTime = process.hrtime.bigint();
    const latencyMs = (Number(endTime - startTime) / 1_000_000).toFixed(2);
    const timestamp = new Date().toISOString();
    const requestId = req.requestId ?? "unknown";
    const method = req.method;
    const path = req.path;
    const status = res.statusCode;

    console.log(
      `[${timestamp}] [${requestId}] ${method} ${path} -> ${status} (${latencyMs}ms)`
    );
  });

  next();
};