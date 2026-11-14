// AI Assistance Disclosure:
// Tool: Claude Code (claude-sonnet-5), date: 2026-09-25
// 25/09/2026: Stage 4a - AppError class
// Author review:
// 25/09/2026: Stage 5e - optional retryAfterSeconds
// Author review:
// 2026-11-10: Bug fix - added an optional `cookie` field, so an AppError thrown deep inside a
//   service transaction (before any response object is reachable) can still carry a cookie for
//   the central error middleware to set on the response. Tool: Claude Code (model:
//   claude-sonnet-5). Governing decision: bug report + team decisions recorded in this task's
//   conversation (pending-token cookie mechanism). No requirements, architecture, schema, or API
//   decisions were made by the AI tool.
// Author review:

import type { CookieOptions } from 'express';

export class AppError extends Error {
  status: number;
  code: string;
  retryAfterSeconds?: number;
  cookie?: { name: string; value: string; options: CookieOptions };

  constructor(
    status: number,
    message: string,
    code: string,
    retryAfterSeconds?: number,
    cookie?: { name: string; value: string; options: CookieOptions },
  ) {
    super(message);
    this.status = status;
    this.code = code;
    if (retryAfterSeconds !== undefined) {
      this.retryAfterSeconds = retryAfterSeconds;
    }
    if (cookie !== undefined) {
      this.cookie = cookie;
    }
  }
}
