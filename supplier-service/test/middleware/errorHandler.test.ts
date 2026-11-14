/*
 * AI Assistance Disclosure:
 * Tool: Codex (model: gpt-5.6-luna), date: 2026-09-28
 * Scope: Generated Phase0 Task6 tests for supplier error response envelopes.
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review: Congchen
 * Scope (2026-09-30, Claude Code, model: claude-sonnet-5): moved from src/middleware/errorHandler.test.ts to test/middleware/errorHandler.test.ts and updated
 *        the relative imports; no test logic changed. No requirements, architecture, schema, or
 *        API decisions were made by the AI tool.
 * Author review:
 */
import { describe, expect, it, vi } from 'vitest';
import type { NextFunction, Request, Response } from 'express';
import { AppError } from '../../src/utils/AppError.js';
import { errorHandler } from '../../src/middleware/errorHandler.js';

function responseDouble() {
  const res = {
    headers: {} as Record<string, string>,
    status: vi.fn().mockReturnThis(),
    setHeader: vi.fn((name: string, value: string) => {
      res.headers[name] = value;
    }),
    json: vi.fn().mockReturnThis(),
  } as unknown as Response & { headers: Record<string, string> };
  return res;
}

describe('errorHandler', () => {
  it('serializes an AppError with details and an SGT timestamp', () => {
    vi.setSystemTime(new Date('2026-09-28T01:02:03.000Z'));
    const res = responseDouble();
    const details = [{ field: 'name', location: 'body', message: 'Required' }];

    errorHandler(
      new AppError(422, 'Validation Error', 'Invalid request', { details }),
      {} as Request,
      res,
      vi.fn() as NextFunction,
    );

    expect(res.status).toHaveBeenCalledWith(422);
    expect(res.json).toHaveBeenCalledWith({
      status_code: 422,
      error: 'Validation Error',
      message: 'Invalid request',
      timestamp: '2026-09-28T09:02:03+08:00',
      details,
    });
  });

  it('omits details when an AppError has no details', () => {
    const res = responseDouble();

    errorHandler(new AppError(401, 'Unauthorized', 'Authentication required'), {} as Request, res, vi.fn());

    expect(res.json).toHaveBeenCalledWith(expect.not.objectContaining({ details: expect.anything() }));
  });

  it('uses a fixed generic envelope without exposing unknown error internals', () => {
    const res = responseDouble();

    errorHandler(new Error('database password'), {} as Request, res, vi.fn());

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        status_code: 500,
        error: 'Internal Server Error',
        message: 'Internal server error',
      }),
    );
    expect((res.json as ReturnType<typeof vi.fn>).mock.calls[0]?.[0]).not.toHaveProperty('details');
  });

  it('sets Retry-After for a rate-limited AppError', () => {
    const res = responseDouble();

    errorHandler(new AppError(429, 'Too Many Requests', 'Try again later', { retryAfterSeconds: 42 }), {} as Request, res, vi.fn());

    expect(res.setHeader).toHaveBeenCalledWith('Retry-After', '42');
  });
});
