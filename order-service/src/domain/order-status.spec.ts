/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: claude-opus-5-5), date: 2026-09-27
 * Scope: Unit tests for the team-authored transition guard (order-status.ts).
 *        The expected edges/roles below restate the team's requirements
 *        (F11–F17); no requirements, architecture, schema, or API decisions
 *        were made by the AI tool.
 * Author review: george-yeo
 * Tool: Claude Code (model: claude-opus-5-5), date: 2026-10-20
 * Scope (2026-10-20): Issues #4/#5 - matrix now covers `pending` (system-only exits) and
 *        F11.2.2 (accepting past complete-by is ORDER_EXPIRED).
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review: george-yeo
 * Scope (2026-10-20): `failed` status - the matrix covers `failed`; pending -> failed (system
 *        only) replaces pending -> cancelled.
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review: george-yeo
 * Tool: Claude Code (model: claude-sonnet-5-5), date: 2026-11-11
 * Scope: matrix updated: system may cancel open/accepted (team decision in chat, 2026-11-11: a supplier shut-down cancels its open/accepted requests).
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review:
 * Tool: Claude Code (model: claude-sonnet-5-5), date: 2026-11-11
 * Scope: matrix: system may cancel pending (team decision in chat, 2026-11-11: pending counts as not yet collected and follows the same cancellation flow).
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review:
 */

import { ErrorCode } from '../constants/errors.js';
import type {
  OrderRequest,
  RequestStatus,
} from '../generated/prisma/client.js';
import {
  checkTransition,
  roleOf,
  SYSTEM_ACTOR,
  type ActorRole,
} from './order-status.js';

const NOW = new Date('2026-09-27T12:00:00.000Z');
const PAST = new Date('2026-09-27T10:00:00.000Z');
const FUTURE = new Date('2026-09-27T14:00:00.000Z');

const REQUESTER = '0192f0c4-0000-7000-8000-00000000000a';
const COURIER = '0192f0c4-0000-7000-8000-00000000000b';
const STRANGER = '0192f0c4-0000-7000-8000-00000000000c';

const STATUSES = [
  'pending',
  'open',
  'accepted',
  'picked_up',
  'delivered',
  'completed',
  'expired',
  'cancelled',
  'failed',
] as RequestStatus[];

const ROLES: ActorRole[] = ['requester', 'courier', 'system', 'other'];

const ACTOR_FOR: Record<ActorRole, string> = {
  requester: REQUESTER,
  courier: COURIER,
  system: SYSTEM_ACTOR,
  other: STRANGER,
};

/**
 * The requirements, restated independently of the implementation so the test
 * catches accidental edits to ALLOWED_TRANSITIONS. Key: "from>to" → roles.
 */
const SPEC: Record<string, ActorRole[]> = {
  'pending>open': ['system'], // issue #4: reservation confirmed
  'pending>failed': ['system'], // reservation failed (George, 2026-10-20)
  'pending>cancelled': ['system'], // supplier shut-down, F8.4.2
  'open>accepted': ['other'], // F11.1, F11.2.1 (not the requester)
  'open>expired': ['system'], // F16.1
  'open>cancelled': ['requester', 'system'], // F17.1, F8.4.2
  'accepted>picked_up': ['courier'], // F13.1.1
  'accepted>cancelled': ['requester', 'system'], // F17.2 (+ deadline for requester), F8.4.2
  'picked_up>delivered': ['courier'], // F14.1.1
  'picked_up>cancelled': ['requester'], // F17.2 (+ deadline)
  'delivered>completed': ['requester', 'system'], // F15.1.1, F15.1.4
};

/** A courier only exists once the order has been accepted. */
function orderIn(
  status: RequestStatus,
  completeBy: Date | null = PAST,
): OrderRequest {
  return {
    id: '0192f0c4-0000-7000-8000-000000000001',
    requesterId: REQUESTER,
    courierId: status === 'open' || status === 'pending' ? null : COURIER,
    status,
    completeBy,
    version: 0,
  } as OrderRequest;
}

describe('roleOf', () => {
  const order = orderIn('accepted');

  it.each([
    [REQUESTER, 'requester'],
    [COURIER, 'courier'],
    [SYSTEM_ACTOR, 'system'],
    [STRANGER, 'other'],
  ])('%s → %s', (actorId, role) => {
    expect(roleOf(order, actorId)).toBe(role);
  });

  it('nobody is the courier before acceptance', () => {
    expect(roleOf(orderIn('open'), COURIER)).toBe('other');
  });
});

// Deadline already passed here, so this isolates the edge + role rules.
describe('checkTransition: every from × to × role', () => {
  const cases = STATUSES.flatMap((from) =>
    STATUSES.flatMap((to) => ROLES.map((role) => ({ from, to, role }))),
  )
    // Skip combinations that can't occur, e.g. a "courier" on an open order.
    .filter(
      ({ from, role }) => roleOf(orderIn(from), ACTOR_FOR[role]) === role,
    );

  it.each(cases)('$from → $to as $role', ({ from, to, role }) => {
    const allowedRoles = SPEC[`${from}>${to}`];
    const expected = !allowedRoles
      ? { ok: false, error: ErrorCode.INVALID_TRANSITION }
      : allowedRoles.includes(role)
        ? // orderIn defaults complete-by to the past, so an allowed accept is expired.
          to === 'accepted'
          ? { ok: false, error: ErrorCode.ORDER_EXPIRED }
          : { ok: true }
        : { ok: false, error: ErrorCode.FORBIDDEN };

    expect(checkTransition(orderIn(from), to, ACTOR_FOR[role], NOW)).toEqual(
      expected,
    );
  });
});

describe('checkTransition: F17.2 cancelling an ongoing request', () => {
  it.each(['accepted', 'picked_up'] as RequestStatus[])(
    '%s: allowed once complete-by has passed',
    (from) => {
      expect(
        checkTransition(orderIn(from, PAST), 'cancelled', REQUESTER, NOW),
      ).toEqual({ ok: true });
    },
  );

  it.each(['accepted', 'picked_up'] as RequestStatus[])(
    '%s: blocked before complete-by',
    (from) => {
      expect(
        checkTransition(orderIn(from, FUTURE), 'cancelled', REQUESTER, NOW),
      ).toEqual({ ok: false, error: ErrorCode.DEADLINE_NOT_REACHED });
    },
  );

  it('allowed at exactly the complete-by time', () => {
    expect(
      checkTransition(orderIn('accepted', NOW), 'cancelled', REQUESTER, NOW),
    ).toEqual({ ok: true });
  });

  it('blocked forever when complete-by is indefinite (null)', () => {
    expect(
      checkTransition(orderIn('accepted', null), 'cancelled', REQUESTER, NOW),
    ).toEqual({ ok: false, error: ErrorCode.DEADLINE_NOT_REACHED });
  });

  it('does not apply to open requests (F17.1: cancel any time)', () => {
    expect(
      checkTransition(orderIn('open', FUTURE), 'cancelled', REQUESTER, NOW),
    ).toEqual({ ok: true });
    expect(
      checkTransition(orderIn('open', null), 'cancelled', REQUESTER, NOW),
    ).toEqual({ ok: true });
  });

  it('role is checked before the deadline (courier gets FORBIDDEN)', () => {
    expect(
      checkTransition(orderIn('accepted', FUTURE), 'cancelled', COURIER, NOW),
    ).toEqual({ ok: false, error: ErrorCode.FORBIDDEN });
  });
});

describe('checkTransition: F11.2.2 accepting an expired request', () => {
  it('rejects acceptance once complete-by has passed, before the sweep runs', () => {
    expect(
      checkTransition(orderIn('open', PAST), 'accepted', STRANGER, NOW),
    ).toEqual({
      ok: false,
      error: ErrorCode.ORDER_EXPIRED,
    });
  });

  it('rejects acceptance at exactly the complete-by time (same boundary as the sweep)', () => {
    expect(
      checkTransition(orderIn('open', NOW), 'accepted', STRANGER, NOW),
    ).toEqual({
      ok: false,
      error: ErrorCode.ORDER_EXPIRED,
    });
  });

  it('allows acceptance before complete-by, and with no complete-by at all', () => {
    expect(
      checkTransition(orderIn('open', FUTURE), 'accepted', STRANGER, NOW),
    ).toEqual({
      ok: true,
    });
    expect(
      checkTransition(orderIn('open', null), 'accepted', STRANGER, NOW),
    ).toEqual({
      ok: true,
    });
  });

  it('a requester accepting their own expired order still gets FORBIDDEN (role first)', () => {
    expect(
      checkTransition(orderIn('open', PAST), 'accepted', REQUESTER, NOW),
    ).toEqual({
      ok: false,
      error: ErrorCode.FORBIDDEN,
    });
  });
});

describe('checkTransition: rules worth naming', () => {
  it('F11.2.1: a requester cannot accept their own order', () => {
    expect(
      checkTransition(orderIn('open'), 'accepted', REQUESTER, NOW),
    ).toEqual({ ok: false, error: ErrorCode.FORBIDDEN });
  });

  it('F11.2.3: an order with a courier cannot be accepted again', () => {
    expect(
      checkTransition(orderIn('accepted'), 'accepted', STRANGER, NOW),
    ).toEqual({ ok: false, error: ErrorCode.INVALID_TRANSITION });
  });

  it('F13.1.1: only the assigned courier can mark picked up', () => {
    expect(
      checkTransition(orderIn('accepted'), 'picked_up', STRANGER, NOW),
    ).toEqual({ ok: false, error: ErrorCode.FORBIDDEN });
  });

  it('F15.1.1: a courier cannot mark their own delivery completed', () => {
    expect(
      checkTransition(orderIn('delivered'), 'completed', COURIER, NOW),
    ).toEqual({ ok: false, error: ErrorCode.FORBIDDEN });
  });

  it('F15.1.4: the system can auto-complete a delivered request', () => {
    expect(
      checkTransition(orderIn('delivered'), 'completed', SYSTEM_ACTOR, NOW),
    ).toEqual({ ok: true });
  });

  it('F16.1: users cannot expire orders; only the system can', () => {
    expect(checkTransition(orderIn('open'), 'expired', REQUESTER, NOW)).toEqual(
      { ok: false, error: ErrorCode.FORBIDDEN },
    );
  });

  it.each(['completed', 'expired', 'cancelled'] as RequestStatus[])(
    '%s is terminal',
    (from) => {
      for (const to of STATUSES) {
        expect(checkTransition(orderIn(from), to, SYSTEM_ACTOR, NOW)).toEqual({
          ok: false,
          error: ErrorCode.INVALID_TRANSITION,
        });
      }
    },
  );

  it('cannot skip steps (open → delivered)', () => {
    expect(
      checkTransition(orderIn('open'), 'delivered', STRANGER, NOW),
    ).toEqual({ ok: false, error: ErrorCode.INVALID_TRANSITION });
  });
});
