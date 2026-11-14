// AI Assistance Disclosure:
// Tool: Claude Code (model: claude-opus-5), date: 2026-09-26
//  2026-09-26: Recess iteration - request validation and response shaping for
//    POST /credits/allocate and POST /credits/reserve.
//    The request and response bodies here are NOT team-decided. context §8 fixes only
//    the method and path; the field names, validation rules and status codes are
//    pending sign-off - see credit-service/README.md.
//    Author review: Wee Jean
//  2026-10-19: Week 9 - transaction history handlers (F19.5.2, F20.2).
//    No requirements, architecture, schema, or API decisions were made by the AI tool.
//    Author review: Reviewed and verified by Koh Wee Jean, 2026-11-10.
//  2026-11-04: Admin filters - optional ?userId= and ?requestId= on the all-transactions
//    handler. No new route and no new response fields.
//    No requirements, architecture, schema, or API decisions were made by the AI tool.
//    Author review: Reviewed and verified by Koh Wee Jean, 2026-11-10.
//  2026-10-16: Week 7/8 catch-up - transfer, release and balance-read handlers.
//    Bodies and status codes for the new endpoints follow the team's decisions of
//    2026-10-16; anything not covered by them is flagged in credit-service/API.md.
//    Author review: Reviewed and verified by Koh Wee Jean, 2026-11-10.

import type { Request, Response } from 'express';
import { z } from 'zod';
import { AppError } from '../utils/AppError.js';
import {
  allocateInitialCredits,
  getAllTransactions,
  getBalance,
  getTransactionsForUser,
  releaseCredits,
  reserveCredits,
  transferCredits,
} from '../services/credits.service.js';

// user_id and request_id are UUIDs owned by User Service and Order Service (context §3).
const allocateSchema = z.object({
  userId: z.string().uuid(),
});

const reserveSchema = z.object({
  userId: z.string().uuid(),
  requestId: z.string().uuid(),
  // Credits are whole and positive; the balance CHECK constraints assume it.
  amount: z.number().int().positive(),
});

// Order Service sends requestId on every credit call (team decision 2026-10-16), so
// there is no reservation handle to carry around.
const transferSchema = z.object({
  requestId: z.string().uuid(),
  courierId: z.string().uuid(),
});

const releaseSchema = z.object({
  requestId: z.string().uuid(),
});

const userIdParamSchema = z.object({
  userId: z.string().uuid(),
});

function parseBody<T>(schema: z.ZodType<T>, body: unknown): T {
  const result = schema.safeParse(body);
  if (!result.success) {
    const details = result.error.issues
      .map((issue) => `${issue.path.join('.') || 'body'}: ${issue.message}`)
      .join('; ');
    throw new AppError(400, details, 'INVALID_REQUEST_BODY');
  }
  return result.data;
}

/** POST /credits/allocate — F19.1.1 */
export async function postAllocate(req: Request, res: Response): Promise<void> {
  const { userId } = parseBody(allocateSchema, req.body);
  const result = await allocateInitialCredits(userId);
  res.status(201).json(result);
}

/** POST /credits/reserve — F19.2.1, F19.2.3 */
export async function postReserve(req: Request, res: Response): Promise<void> {
  const { userId, requestId, amount } = parseBody(reserveSchema, req.body);
  const result = await reserveCredits(userId, requestId, amount);
  res.status(201).json(result);
}

/** POST /credits/transfer — F19.3.1, F19.3.2 */
export async function postTransfer(req: Request, res: Response): Promise<void> {
  const { requestId, courierId } = parseBody(transferSchema, req.body);
  const result = await transferCredits(requestId, courierId);
  res.status(201).json(result);
}

/** POST /credits/release — F19.4.1 */
export async function postRelease(req: Request, res: Response): Promise<void> {
  const { requestId } = parseBody(releaseSchema, req.body);
  const result = await releaseCredits(requestId);
  res.status(201).json(result);
}

/** GET /credits/balance/:userId — F19.5.1. Unauthenticated; see requireBalanceAccess. */
export async function getBalanceByUserId(req: Request, res: Response): Promise<void> {
  const { userId } = parseBody(userIdParamSchema, req.params);
  const balance = await getBalance(userId);
  res.status(200).json({ balance });
}

/** GET /credits/transactions — F19.5.2. Scoped to the caller. */
export async function getMyTransactions(req: Request, res: Response): Promise<void> {
  // req.user is set by requireAuth, which runs first on this route.
  const cursor = typeof req.query.cursor === 'string' ? req.query.cursor : undefined;
  res.status(200).json(await getTransactionsForUser(req.user!.userId, cursor));
}

// Optional administrator filters on GET /credits/transactions/all. Both are UUIDs owned
// by other services (context §3), validated here so a malformed one is a 400 before any
// query runs rather than a Postgres cast error. `.optional()` on each keeps both absent
// meaning "no filter"; unknown query keys are ignored, as elsewhere.
const transactionFilterSchema = z.object({
  userId: z.string().uuid().optional(),
  requestId: z.string().uuid().optional(),
});

/** GET /credits/transactions/all — F20.2, F20.2.1. Gated on rank >= admin. */
export async function getEveryTransaction(req: Request, res: Response): Promise<void> {
  const cursor = typeof req.query.cursor === 'string' ? req.query.cursor : undefined;
  // parseBody is named for bodies but is just "validate this object or throw 400
  // INVALID_REQUEST_BODY"; the balance route already reuses it for req.params.
  const filters = parseBody(transactionFilterSchema, {
    ...(typeof req.query.userId === 'string' ? { userId: req.query.userId } : {}),
    ...(typeof req.query.requestId === 'string' ? { requestId: req.query.requestId } : {}),
  });
  res.status(200).json(await getAllTransactions(filters, cursor));
}
