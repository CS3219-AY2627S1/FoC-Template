/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: claude-sonnet-5), date: 2026-09-27
 * Scope: Generated Vitest unit tests for the authorize middleware, covering the Stage 8
 *        Verification bullets in instructions.md.
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review: Verified that the test cases are in sync with the code. 
 */
import type { NextFunction, Request, Response } from 'express';
import { describe, expect, it, vi } from 'vitest';
import { authorize } from '../../src/middleware/authorize.js';

// Fake req/res/next: no DB and no Express app needed.
function run(minimumRole: string, user?: { user_id: string; role: string }) {
  const req = { user } as Request;
  const json = vi.fn();
  const status = vi.fn().mockReturnValue({ json });
  const res = { status } as unknown as Response;
  const next = vi.fn() as unknown as NextFunction;
  const result = authorize(minimumRole)(req, res, next);
  return { result, next, status, json };
}

describe('authorize middleware', () => {
  const allow: [string, string][] = [
    ['user', 'user'],
    ['admin', 'admin'],
    ['admin', 'user'],
    ['super admin', 'admin'],
  ];
  const deny: [string, string][] = [
    ['user', 'admin'],
    ['admin', 'super admin'],
  ];

  it.each(allow)('%s caller passes authorize(%s)', (callerRole, minimumRole) => {
    const { next, status } = run(minimumRole, { user_id: 'u1', role: callerRole });
    expect(next).toHaveBeenCalledTimes(1);
    expect(status).not.toHaveBeenCalled();
  });

  it.each(deny)('%s caller is rejected by authorize(%s) with 403 FORBIDDEN', (callerRole, minimumRole) => {
    const { next, status, json } = run(minimumRole, { user_id: 'u1', role: callerRole });
    expect(next).not.toHaveBeenCalled();
    expect(status).toHaveBeenCalledWith(403);
    expect(json).toHaveBeenCalledWith({ message: 'Forbidden', code: 'FORBIDDEN' });
  });

  it('responds 401 UNAUTHORIZED, and never calls next, when req.user is not set', () => {
    const { next, status, json } = run('admin', undefined);
    expect(next).not.toHaveBeenCalled();
    expect(status).toHaveBeenCalledWith(401);
    expect(json).toHaveBeenCalledWith({ message: 'Unauthorized', code: 'UNAUTHORIZED' });
  });

  it('returns a middleware function from the factory, not a response', () => {
    expect(typeof authorize('admin')).toBe('function');
  });

  it('throws nothing of its own and is synchronous (no promise returned)', () => {
    expect(() => run('admin', { user_id: 'u1', role: 'user' })).not.toThrow();
    expect(() => run('admin', undefined)).not.toThrow();
    const { result } = run('admin', { user_id: 'u1', role: 'admin' });
    expect(result).toBeUndefined();
  });
});
