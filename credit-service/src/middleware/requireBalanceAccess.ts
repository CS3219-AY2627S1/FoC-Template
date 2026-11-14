// AI Assistance Disclosure:
// Tool: Claude Code (model: claude-opus-5), date: 2026-10-16
//  2026-10-16: Week 7/8 catch-up - the authorization seam for F19.5.1. Written but NOT
//    mounted; blocked on the user-service public key.
//    No requirements, architecture, schema, or API decisions were made by the AI tool.
//    Author review: Wee Jean
//  2026-10-19: Week 9 - unblocked by JWKS. The verifier is now async, and this composes
//    the two middlewares rather than reimplementing bearer parsing.
//    No requirements, architecture, schema, or API decisions were made by the AI tool.
//    Author review: Reviewed and verified by Koh Wee Jean, 2026-11-10.

import type { RequestHandler } from 'express';
import { requireAuth, requireSelfOrElevated } from './auth.js';
import type { TokenVerifier } from '../auth/verifyAccessToken.js';

/**
 * F19.5.1 - a user may read only their own balance unless they hold an elevated role.
 *
 * Returns the pair as an array; Express accepts that wherever a handler is expected.
 */
export function requireBalanceAccess(verify: TokenVerifier): RequestHandler[] {
  return [requireAuth(verify), requireSelfOrElevated];
}
