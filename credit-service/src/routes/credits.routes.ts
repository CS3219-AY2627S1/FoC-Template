// AI Assistance Disclosure:
// Tool: Claude Code (model: claude-opus-5), date: 2026-09-26
//  2026-09-26: Recess iteration - routes for the two operations in scope.
//    Methods and paths are the team's, from credit-service-context.md §8.
//    No requirements, architecture, schema, or API decisions were made by the AI tool.
//    Author review: Wee Jean
//  2026-10-19: Week 9 - mount authentication; add the two history routes.
//    No requirements, architecture, schema, or API decisions were made by the AI tool.
//    Author review: Reviewed and verified by Koh Wee Jean, 2026-11-10.
//  2026-10-16: Week 7/8 catch-up - transfer, release and balance routes.
//    No requirements, architecture, schema, or API decisions were made by the AI tool.
//    Author review: Reviewed and verified by Koh Wee Jean, 2026-11-10.

import { Router } from 'express';
import { asyncHandler } from '../utils/asyncHandler.js';
import { requireAuth, requireElevated } from '../middleware/auth.js';
import { requireBalanceAccess } from '../middleware/requireBalanceAccess.js';
import { createJwksVerifier } from '../auth/verifyAccessToken.js';
import { config } from '../config.js';
import {
  getBalanceByUserId,
  getEveryTransaction,
  getMyTransactions,
  postAllocate,
  postRelease,
  postTransfer,
  postReserve,
} from '../controllers/credits.controller.js';

const router = Router();

// One verifier for the process: createRemoteJWKSet holds the key cache, so building it
// per request would discard the cache and refetch the key set every time.
const verifyToken = createJwksVerifier(config.jwksUrl);

// context §8.
//
// The write endpoints are called by other services, not by browsers, and are left
// unauthenticated: service-to-service authentication is not specified anywhere in the
// backlog and is not this iteration's scope. Flagged in API.md.
router.post('/allocate', asyncHandler(postAllocate));
router.post('/reserve', asyncHandler(postReserve));
router.post('/transfer', asyncHandler(postTransfer));
router.post('/release', asyncHandler(postRelease));

// F19.5.1 - your own balance, or anyone's with rank >= admin.
router.get('/balance/:userId', requireBalanceAccess(verifyToken), asyncHandler(getBalanceByUserId));

// F19.5.2 - the caller's own records.
router.get('/transactions', requireAuth(verifyToken), asyncHandler(getMyTransactions));

// F20.2 / F20.2.1 - every user's records, administrators only.
router.get(
  '/transactions/all',
  requireAuth(verifyToken),
  requireElevated,
  asyncHandler(getEveryTransaction),
);

export default router;
