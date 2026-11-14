// AI Assistance Disclosure:
// Tool: Claude Code (model: claude-sonnet-5), date: 2026-11-09
// Scope: Stage 27a/27b - elevatedTokenHeader, shared by adminOtp.controller.ts and
//        users.controller.ts to read the `Elevated-Token` request header. Governing decision:
//        instructions.md Stage 27 ("Sent on requests: Elevated-Token request header"). No
//        requirements, architecture, schema, or API decisions were made by the AI tool.
// Author review:

import type { Request } from 'express';

// Absent for a caller that holds no elevation token; its presence does not mean it is valid
// for this caller's device, which the service layer re-checks (isElevated).
export function elevatedTokenHeader(req: Request): string | undefined {
  const header = req.headers['elevated-token'];
  return typeof header === 'string' ? header : undefined;
}
