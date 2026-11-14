// AI Assistance Disclosure:
// Tool: Claude Code (claude-sonnet-5), date: 2026-09-25
// 25/09/2026: Stage 4a - Bearer token authentication middleware
// Author review:
// 2026-11-09: Stage 27a - req.user also carries `sid`, read from the access token (now
//   typ: at+JWT). Governing decision: instructions.md Stage 27. No requirements,
//   architecture, schema, or API decisions were made by the AI tool.
// Author review:

import type { NextFunction, Request, Response } from 'express';
import { verifyAccessToken } from '../utils/jwt.js';

export function authenticate(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ message: 'Unauthorized', code: 'UNAUTHORIZED' });
    return;
  }

  const token = authHeader.slice('Bearer '.length);

  try {
    const { user_id, role, sid } = verifyAccessToken(token);
    req.user = { user_id, role, sid };
    next();
  } catch {
    res.status(401).json({ message: 'Unauthorized', code: 'UNAUTHORIZED' });
  }
}
