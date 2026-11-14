// AI Assistance Disclosure:
// Tool: Claude Code (model: claude-sonnet-5), date: 2026-11-09
// Scope: Stage 27a/27b - isElevated, shared by adminOtp.service.ts (ALREADY_ELEVATED on
//        send/verify/resend) and users.service.ts (ELEVATION_REQUIRED on status/role changes).
//        Governing decision: instructions.md Stage 27's elevation token table ("sid mismatch
//        -> 403 ELEVATION_REQUIRED" / "valid token for the caller -> 409 ALREADY_ELEVATED").
//        No requirements, architecture, schema, or API decisions were made by the AI tool.
// Author review:

import { verifyElevationToken } from './jwt.js';

// True only for a structurally valid, unexpired elevation token whose sub and sid match this
// caller's device. An absent, invalid or expired token is simply "not elevated", never thrown
// here - callers decide what that means (ALREADY_ELEVATED allows through; ELEVATION_REQUIRED
// rejects).
export function isElevated(
  elevatedToken: string | undefined,
  userId: string,
  sid: string,
): boolean {
  if (!elevatedToken) return false;
  try {
    const decoded = verifyElevationToken(elevatedToken);
    return decoded.user_id === userId && decoded.sid === sid;
  } catch {
    return false;
  }
}
