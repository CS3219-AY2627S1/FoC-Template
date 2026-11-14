/*
 * AI Assistance Disclosure:
 * Tool: Codex (model: gpt-5.6-luna), date: 2026-09-28
 * Scope: Generated Phase0 Task6 Express error envelope middleware.
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review: Congchen
 */
import type { ErrorRequestHandler } from 'express';
import { AppError } from '../utils/AppError.js';
import { sgtTimestamp } from '../utils/time.js';

export const errorHandler: ErrorRequestHandler = (error, _request, response, _next) => {
  if (!(error instanceof AppError)) {
    console.error(error);
    response.status(500).json({
      status_code: 500,
      error: 'Internal Server Error',
      message: 'Internal server error',
      timestamp: sgtTimestamp(),
    });
    return;
  }

  if (error.retryAfterSeconds !== undefined) {
    response.setHeader('Retry-After', String(error.retryAfterSeconds));
  }

  const envelope: {
    status_code: number;
    error: string;
    message: string;
    timestamp: string;
    details?: typeof error.details;
  } = {
    status_code: error.statusCode,
    error: error.error,
    message: error.message,
    timestamp: sgtTimestamp(),
  };

  if (error.details !== undefined) envelope.details = error.details;
  response.status(error.statusCode).json(envelope);
};
