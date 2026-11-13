// AI Assistance Disclosure:
// Tool: Claude Code (Claude Opus), date: 2026-09-28
// Scope: AI added the req.user type.
// Author review: Author reviewed the code and approved. See
// user-service/ai/usage-log.md, entry 008.

import type { Roles } from '@prisma/client';

declare global {
  namespace Express {
    interface Request {
      user?: { id: string; roles: Roles[] };
    }
  }
}

export {};
