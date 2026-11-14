// AI Assistance Disclosure:
// Tool: Claude Code (model: claude-opus-5), date: 2026-10-19
//  2026-10-19: Week 9 - req.user typing, mirroring user-service/src/types/express.d.ts.
//    No requirements, architecture, schema, or API decisions were made by the AI tool.
//    Author review: Reviewed and verified by Koh Wee Jean, 2026-11-10.

import type { AuthenticatedUser } from '../auth/roleRank.js';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
    }
  }
}

export {};
