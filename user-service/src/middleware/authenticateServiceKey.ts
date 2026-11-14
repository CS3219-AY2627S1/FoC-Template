// AI Assistance Disclosure:
// Tool: Claude Code (model: claude-sonnet-5), date: 2026-11-09
// Scope: Stage 28b (Scheduled Errands), per instructions.md - service-key middleware for
//        GET /users/worker/:id, called by order-service's scheduler.
//        No requirements, architecture, schema, or API decisions were made by the AI tool.
// Author review:

import type { NextFunction, Request, Response } from 'express';
import { config } from '../config.js';
import { hashesMatch, sha256 } from '../utils/hash.js';

export function authenticateServiceKey(req: Request, res: Response, next: NextFunction): void {
  const supplied = req.get('User-Order-Service-Key');

  if (!supplied || !hashesMatch(sha256(supplied), sha256(config.userOrderService.apiKey))) {
    res.status(401).json({ message: 'Invalid service key', code: 'INVALID_SERVICE_KEY' });
    return;
  }

  next();
}
