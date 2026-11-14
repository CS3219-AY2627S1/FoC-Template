/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: claude-opus-5-5), date: 2026-10-20
 * Scope: Issue #4 - added the `pending` status edges for the credit-reservation saga
 *        (system moves pending -> open on reserve success, pending -> cancelled on
 *        failure; George's decisions 2026-10-19), and kept the F17.2 deadline rule
 *        to requester cancellation of ongoing orders only.
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review: george-yeo
 * Scope (2026-10-20): Issue #5 - F11.2.2: an order past its complete-by cannot be
 *        accepted even before the expiry sweep has run (George: expired = past
 *        completeBy if set).
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review: george-yeo
 * Scope (2026-10-20): `failed` status - a failed reservation moves pending -> failed
 *        (system only) instead of pending -> cancelled (George, 2026-10-20: "the transition is
 *        only pending -> failed"); failed is terminal.
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review: george-yeo
 * Tool: Claude Code (model: claude-sonnet-5-5), date: 2026-11-11
 * Scope: the system actor may cancel open and accepted requests, skipping the F17.2 deadline (team decision in chat, 2026-11-11: a supplier shut-down cancels its open/accepted requests).
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review:
 * Tool: Claude Code (model: claude-sonnet-5-5), date: 2026-11-11
 * Scope: the system actor may also cancel a pending request (team decision in chat, 2026-11-11: pending counts as not yet collected and follows the same cancellation flow).
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review:
 */

import type {
  OrderRequest,
  RequestStatus,
} from '../generated/prisma/client.js';
import { ErrorCode } from '../constants/errors.js';

export type ActorRole = 'requester' | 'courier' | 'system' | 'other';
export const SYSTEM_ACTOR = 'system';
export type ActorId = string; // user UUID, or SYSTEM_ACTOR for internal callers

const ALLOWED_TRANSITIONS: Record<
  RequestStatus,
  Partial<Record<RequestStatus, readonly ActorRole[]>>
> = {
  // Reservation outcome is applied by the worker only (issue #4).
  pending: { open: ['system'], failed: ['system'], cancelled: ['system'] },
  open: {
    accepted: ['other'],
    expired: ['system'],
    cancelled: ['requester', 'system'],
  },
  accepted: { picked_up: ['courier'], cancelled: ['requester', 'system'] },
  picked_up: { delivered: ['courier'], cancelled: ['requester'] },
  delivered: { completed: ['requester', 'system'] },
  completed: {},
  expired: {},
  cancelled: {},
  failed: {},
};

export function roleOf(order: OrderRequest, actorId: ActorId): ActorRole {
  if (actorId === SYSTEM_ACTOR) return 'system';
  if (actorId === order.requesterId) return 'requester';
  if (actorId === order.courierId) return 'courier';
  return 'other';
}

export type TransitionCheck =
  | { ok: true }
  | {
      ok: false;
      error:
        | ErrorCode.INVALID_TRANSITION
        | ErrorCode.FORBIDDEN
        | ErrorCode.DEADLINE_NOT_REACHED
        | ErrorCode.ORDER_EXPIRED;
    };

export function checkTransition(
  order: OrderRequest,
  to: RequestStatus,
  actorId: ActorId,
  now: Date = new Date(),
): TransitionCheck {
  const allowedRoles = ALLOWED_TRANSITIONS[order.status][to];
  if (!allowedRoles) return { ok: false, error: ErrorCode.INVALID_TRANSITION };
  if (!allowedRoles.includes(roleOf(order, actorId)))
    return { ok: false, error: ErrorCode.FORBIDDEN };

  // F11.2.2: past its complete-by, an order is expired even if the minute-by-minute
  // expiry sweep has not marked it yet. Same boundary as the sweep (lte now).
  if (to === 'accepted' && order.completeBy && now >= order.completeBy) {
    return { ok: false, error: ErrorCode.ORDER_EXPIRED };
  }

  // F17.2: an ongoing (accepted / picked_up) order can only be cancelled after its
  // complete-by deadline. Open and pending orders are not "ongoing".
  if (
    to === 'cancelled' &&
    roleOf(order, actorId) !== 'system' &&
    order.status !== 'open' &&
    order.status !== 'pending'
  ) {
    if (!order.completeBy || now < order.completeBy)
      return { ok: false, error: ErrorCode.DEADLINE_NOT_REACHED };
  }
  return { ok: true };
}
