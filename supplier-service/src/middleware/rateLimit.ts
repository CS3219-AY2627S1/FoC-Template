/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: claude-sonnet-5), date: 2026-09-29
 * Scope: Generated Phase 0 project scaffold (SupplierServiceSpec.md, "Phase 0 — Foundations").
 *        Implements the fixed 30-requests-per-minute-per-IP limit from SupplierServiceArchitecture.md
 *        §7.5 as an in-memory counter (no new library dependency introduced for this). No
 *        requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review: Congchen
 * Scope (2026-11-04, Codex, model: GPT-6): Applied the team-specified configurable per-IP limit.
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review: Congchen
 */
import { config } from '../config.js';
import type { NextFunction, Request, Response } from 'express';
import { AppError } from '../utils/AppError.js';

const WINDOW_MS = 60_000;

interface WindowState {
  count: number;
  windowStart: number;
}

export function createRateLimiter() {
  const hits = new Map<string, WindowState>();

  return function rateLimit(req: Request, _res: Response, next: NextFunction): void {
    const key = req.ip ?? 'unknown';
    const now = Date.now();
    const state = hits.get(key);

    if (state === undefined || now - state.windowStart >= WINDOW_MS) {
      hits.set(key, { count: 1, windowStart: now });
      next();
      return;
    }

    if (state.count >= config.perIpRateLimit) {
      const retryAfterSeconds = Math.ceil((state.windowStart + WINDOW_MS - now) / 1000);
      next(
        new AppError(429, 'Too Many Requests', 'Rate limit exceeded. Try again later.', {
          retryAfterSeconds,
        }),
      );
      return;
    }

    state.count += 1;
    next();
  };
}
