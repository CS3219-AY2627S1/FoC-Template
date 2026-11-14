/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: claude-opus-5-5), date: 2026-09-23
 * Scope: Project scaffolding / infrastructure only. No requirements,
 *        architecture, schema, or API decisions were made by the AI tool.
 * Author review: george-yeo
 */

import type { ErrorRequestHandler, RequestHandler } from 'express';

export const notFound: RequestHandler = (req, res) => {
  res
    .status(404)
    .json({ message: `Not found: ${req.method} ${req.originalUrl}` });
};

/**
 * Last-resort handler. Express 5 forwards rejected promises from async route
 * handlers here automatically, so no try/catch wrapper is needed in routes.
 * All error responses use the same `{ message }` shape as the controllers.
 */
export const errorHandler: ErrorRequestHandler = (err, _req, res, next) => {
  if (res.headersSent) {
    next(err);
    return;
  }
  // body-parser & http-errors style errors carry a 4xx `status`.
  const status =
    typeof err?.status === 'number' && err.status >= 400 && err.status < 600
      ? err.status
      : 500;
  if (status >= 500) console.error(err);
  res.status(status).json({
    message: status >= 500 ? 'Internal server error.' : String(err.message),
  });
};
