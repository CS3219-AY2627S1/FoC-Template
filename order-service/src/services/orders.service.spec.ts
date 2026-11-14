/*
 * AI Assistance Disclosure:
 * Scope (2026-11-08, Codex, model: GPT-6): Implemented precise delivery details per the team spec. No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review:
 * Tool: Claude Code (model: claude-opus-5-5), date: 2026-09-27
 * Scope: Unit tests for team-authored createOrder validation rules and the
 *        F9.1.2 reserve-then-create flow.
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review: george-yeo
 * Scope (2026-09-29): Added getOrders unit tests for unfiltered and status-filtered queries.
 * Author review: tng wen xi
 * Scope (2026-10-04): Updated getOrders unit tests for result objects, invalid
 *        status handling, and database-error results.
 * Author review: tng wen xi
 * Scope (2026-10-07): Added transitionOrder unit coverage for missing orders,
 *        forbidden actors, invalid edges, optimistic-lock conflicts, and success.
 * Author review: george-yeo
 * Scope (2026-10-08): Added F17 cancellation transition coverage for open and
 *        deadline-reached requests, including deadline and actor failures.
 * Author review: tng wen xi
 * Scope (2026-10-12): Added edit-order coverage for unsupported fields and
 *        Prisma not-found errors.
 * Author review: tng wen xi
 * Scope (2026-10-12): Added edit-order optimistic-lock success and conflict
 *        coverage.
 * Author review: tng wen xi
 * Scope (2026-10-12): Added maintenance-worker coverage for system-actor
 *        completion, deadline expiry, and optimistic-lock races.
 * Author review: tng wen xi
 * Scope (2026-10-12): Updated create-order fixtures for additional-details
 *        validation and added edit-order not-found and forbidden coverage.
 * Author review: tng wen xi
 * Scope (2026-10-13): Added cancellation credit-release coverage.
 * Author review: tng wen xi
 * Scope (2026-10-13): Added deadline-boundary, missing-reservation, release
 *        failure, and terminal-state lifecycle coverage.
 * Author review: tng wen xi
 * Scope (2026-10-13): Updated fixtures for persisted reservation identifiers
 *        and credit release inputs.
 * Author review: tng wen xi
 * Tool: Claude Code (model: claude-opus-5-5), date: 2026-10-20
 * Scope (2026-10-20): Issue #4 - createOrder now writes a pending order + credit_reserve
 *        outbox row in one transaction; cancel/expire of a funded order queues a
 *        credit_release outbox row in the transition's transaction instead of releasing
 *        inline by reservationId; `credits` is no longer editable. Rewrote the affected
 *        cases and added fakes for $transaction and outbox.
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review: george-yeo
 * Scope (2026-10-20): Issue #11 - fixtures use deliveryLocationId; getOrders cases moved
 *        to order-listing.service.spec.ts with the new listing.
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review: george-yeo
 * Scope (2026-10-20): `failed` status - pending orders settle to `failed`; pending ->
 *        cancelled is no longer a transition.
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review: george-yeo
 * Scope (2026-10-20): F9.1.1 / F18.1.1 - additional details optional on
 *        create; edit refused unless the request is open.
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review: george-yeo
 * Scope (2026-10-20): Edit validation cases for every editable field.
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review: george-yeo
 * Scope (2026-10-21): Credit transfer - completion (requester or system)
 *        queues a credit_transfer outbox row; other transitions do not.
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review: George Yeo
 * Tool: Claude Code (model: claude-opus-5-5), date: 2026-10-23
 * Scope (2026-10-23): create / edit take the supplier-service reference check (stubbed
 *        to "exists" for the existing cases); new coverage for not found (422 codes),
 *        unavailable, and edit checking only the ids it changes, after authorization.
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review: George Yeo
 * Scope (2026-11-08, Codex, model: GPT-6): Tested status notification jobs and fallback text.
 * Author review:tng wen xi
 * Scope (2026-11-08, Codex, model: GPT-6): Implemented or tested team-specified order-based courier participant delivery.
 * Author review:tng wen xi
 * Scope (2026-11-09, Claude Code, model: claude-sonnet-5): Added the two new SuppliersClient
 *        worker-only stub methods to the fake client in the supplier-service reference check
 *        tests, per Stage 28 c2's interface change; no test logic changed. No requirements,
 *        architecture, schema, or API decisions were made by the AI tool.
 * Author review:
 * Tool: Claude Code (model: claude-opus-5-5), date: 2026-11-09
 * Scope (2026-11-09): Default complete-by - create with completeBy absent or null stores
 *        now + 1 hour; edit with completeBy: null leaves it out of the write.
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review: George Yeo
 * Scope (2026-11-09): Synchronous reservation - createOrder fakes keep the order in memory
 *        and take a credits client; the outbox reserve-task cases are replaced by open /
 *        insufficient / rejected / unavailable outcomes and the pending-order 409 check.
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review: George Yeo
 * Scope (2026-11-10, Codex, model: GPT-6): Verified terminal transitions enqueue archiving after notification.
 * Author review: tng wen xi
 * Scope (2026-11-10, Codex, model: GPT-6): Implemented or verified user-specified order message actor fields and toast filtering.
 * No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review: tng wen xi
 * Author review:tng wen xi
 * Tool: Claude Code (model: claude-sonnet-5-5), date: 2026-11-11
 * Scope: the pending-order test now expects the system actor may cancel a pending order, so it checks 'completed' instead (team decision in chat, 2026-11-11: pending counts as not yet collected).
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review:
 */

import { ErrorCode } from '../constants/errors.js';

// AI-generated (edited by <name>).
it('requires delivery details when creating an order', async () => {
  const { prisma } = fakes();
  const { deliveryDetails: _details, ...withoutDetails } = valid;
  const result = await createOrder(
    prisma,
    REQUESTER,
    withoutDetails as CreateOrderPayload,
    REFS,
    CREDITS,
  );
  expect(result).toEqual({ ok: false, errors: ['MISSING_DELIVERY_DETAILS'] });
});
import type { PrismaClient } from '../db/prisma.js';
import { Prisma } from '../generated/prisma/client.js';
import {
  RequestStatus,
  type OrderRequest,
} from '../generated/prisma/client.js';
import type { CreateOrderPayload } from '../types/orders.js';
import {
  createStubCreditsClient,
  type CreditCallResult,
  type CreditsClient,
} from '../clients/credits.client.js';
import {
  createStubSuppliersClient,
  type Existence,
  type SuppliersClient,
} from '../clients/suppliers.client.js';
import {
  createOrder,
  editOrder as editOrderImpl,
  runRequestMaintenance,
  transitionOrder,
} from './orders.service.js';

const editWithDetails = (...args: Parameters<typeof editOrderImpl>) => {
  args[3] = { deliveryDetails: 'Nil', ...args[3] };
  return editOrderImpl(...args);
};

it.each([
  [null, ErrorCode.MISSING_DELIVERY_DETAILS],
  ['', ErrorCode.MISSING_DELIVERY_DETAILS],
  ['   ', ErrorCode.MISSING_DELIVERY_DETAILS],
  [12, ErrorCode.INVALID_DELIVERY_DETAILS],
  ['x'.repeat(251), ErrorCode.INVALID_DELIVERY_DETAILS],
])('validates delivery details %s', async (deliveryDetails, code) => {
  const result = await createOrder(
    fakes().prisma,
    REQUESTER,
    { ...valid, deliveryDetails } as CreateOrderPayload,
    REFS,
    CREDITS,
  );
  expect(result).toEqual({ ok: false, errors: [code] });
});

it('trims delivery details on create and requires them on edit', async () => {
  const { prisma, create } = fakes();
  expect(
    (
      await createOrder(
        prisma,
        REQUESTER,
        { ...valid, deliveryDetails: '  Lobby  ' },
        REFS,
        CREDITS,
      )
    ).ok,
  ).toBe(true);
  expect(create).toHaveBeenCalledWith({
    data: expect.objectContaining({ deliveryDetails: 'Lobby' }),
  });
  expect(
    (
      await createOrder(
        fakes().prisma,
        REQUESTER,
        { ...valid, deliveryDetails: 'x'.repeat(250) },
        REFS,
        CREDITS,
      )
    ).ok,
  ).toBe(true);
  expect(await editOrderImpl(prisma, REQUESTER, 'id', {}, REFS)).toEqual({
    ok: false,
    errors: [ErrorCode.MISSING_DELIVERY_DETAILS],
  });
});

const NOW = new Date('2026-09-27T12:00:00.000Z');
const LATER = '2099-09-27T14:00:00.000Z';
const EARLIER = '2026-09-27T10:00:00.000Z';

const REQUESTER = '0192f0c4-7a1e-7c3a-9b2d-3f4e5a6b7c8d';
/** Every supplier / location exists; tests of the check build their own. */
const REFS = {
  suppliers: createStubSuppliersClient(),
  authorization: 'Bearer test',
};
/** credit-service that always reserves. */
const CREDITS = createStubCreditsClient();
const SUPPLIER = 1;
const OTHER_USER = '0192f0c4-7a1e-7c3a-9b2d-4f5e6a7b8c9d';

const valid: CreateOrderPayload = {
  supplierId: SUPPLIER,
  description: '1x chicken rice',
  deliveryLocationId: 12,
  deliveryDetails: 'Nil',
  credits: 4,
  additionalDetails: null,
};

/**
 * Prisma fake for createOrder: keeps the created order in memory so the synchronous
 * settle (pending -> open / failed via transitionOrder) can read and update it.
 */
function fakes({
  pendingExists = false,
  reserve = async (): Promise<CreditCallResult> => ({ ok: true }),
}: {
  /** The requester already has a pending order. */
  pendingExists?: boolean;
  reserve?: CreditsClient['reserve'];
} = {}) {
  let row: Record<string, unknown> | null = null;
  const create = vi.fn(async ({ data }: { data: object }) => {
    row = { id: 'generated', version: 0, ...data };
    return row;
  });
  const findFirst = vi.fn(async () => (pendingExists ? { id: 'other' } : null));
  const orderRequest = {
    create,
    findFirst,
    findUnique: vi.fn(async () => row),
    findUniqueOrThrow: vi.fn(async () => row),
    updateMany: vi.fn(async ({ data }: { data: { status: string } }) => {
      row = { ...row, status: data.status, version: Number(row?.version) + 1 };
      return { count: 1 };
    }),
  };
  const outbox = { createMany: vi.fn(async () => ({ count: 1 })) };
  const $executeRaw = vi.fn(async () => 1);
  const $transaction = vi.fn(async (fn: (tx: unknown) => Promise<unknown>) =>
    fn(prisma),
  );
  const prisma = { orderRequest, outbox, $transaction, $executeRaw };
  const reserveMock = vi.fn(reserve);
  const credits: CreditsClient = {
    reserve: reserveMock,
    release: vi.fn(async (): Promise<CreditCallResult> => ({ ok: true })),
  };
  return {
    prisma: prisma as unknown as PrismaClient,
    outbox,
    $transaction,
    $executeRaw,
    findFirst,
    create,
    credits,
    reserve: reserveMock,
    row: () => row,
  };
}

type OutboxFake = { createMany: ReturnType<typeof vi.fn> };

/** Adds an interactive-$transaction fake (runs the callback on the same client) and an outbox. */
function withTx(fake: object): PrismaClient {
  const outbox: OutboxFake = { createMany: vi.fn(async () => ({ count: 1 })) };
  const prisma: Record<string, unknown> = { outbox, ...fake };
  prisma.$transaction = vi.fn(async (fn: (tx: unknown) => Promise<unknown>) =>
    fn(prisma),
  );
  return prisma as unknown as PrismaClient;
}

function outboxOf(prisma: PrismaClient): OutboxFake {
  return (prisma as unknown as { outbox: OutboxFake }).outbox;
}

const releaseRow = (requestId: string, version: number) => ({
  data: [{ taskName: 'credit_release', payload: { requestId }, version }],
});

// Simulates an untyped JSON body (what Express actually hands us).
async function run(payload: object, deps: ReturnType<typeof fakes> = fakes()) {
  const result = await createOrder(
    deps.prisma,
    REQUESTER,
    payload as unknown as CreateOrderPayload,
    REFS,
    deps.credits,
  );
  return { result, ...deps };
}

beforeEach(() => {
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('createOrder: validation', () => {
  it('creates the order with only the allowed fields', async () => {
    const { result, create } = await run({
      ...valid,
      completeBy: LATER,
      status: 'completed',
      courierId: REQUESTER,
      version: 99,
      additionalDetails: null,
    });

    expect(result.ok).toBe(true);
    expect(create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        requesterId: REQUESTER,
        supplierId: SUPPLIER,
        description: '1x chicken rice',
        deliveryLocationId: 12,
        deliveryDetails: 'Nil',
        credits: 4,
        completeBy: new Date(LATER),
        additionalDetails: null,
        status: 'pending',
      }),
    });
  });

  it('treats additional details as optional (F9.1.1)', async () => {
    const { additionalDetails: _omitted, ...withoutDetails } = valid;
    const { result, create } = await run(withoutDetails);
    expect(result.ok).toBe(true);
    expect(create).toHaveBeenCalledWith({
      data: expect.objectContaining({ additionalDetails: null }),
    });
  });

  it('reports every missing required field, without queueing a reservation', async () => {
    const { result, create, outbox } = await run({});
    expect(result).toEqual({
      ok: false,
      errors: [
        ErrorCode.MISSING_SUPPLIER,
        ErrorCode.MISSING_DESCRIPTION,
        ErrorCode.MISSING_DELIVERY_LOCATION,
        ErrorCode.MISSING_DELIVERY_DETAILS,
        ErrorCode.MISSING_CREDITS_OFFERED,
      ],
    });
    expect(outbox.createMany).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
  });

  it.each([
    [
      'supplierId not a positive integer',
      { supplierId: 's1' },
      ErrorCode.INVALID_SUPPLIER,
    ],
    [
      'description not text',
      { description: 123 },
      ErrorCode.INVALID_DESCRIPTION,
    ],
    [
      'description whitespace',
      { description: '   ' },
      ErrorCode.INVALID_DESCRIPTION,
    ],
    [
      'deliveryLocationId not an id',
      { deliveryLocationId: 'COM1 Basement' },
      ErrorCode.INVALID_DELIVERY_LOCATION,
    ],
    ['credits 0', { credits: 0 }, ErrorCode.INVALID_CREDITS_OFFERED],
    ['credits negative', { credits: -2 }, ErrorCode.INVALID_CREDITS_OFFERED],
    ['credits fractional', { credits: 1.5 }, ErrorCode.INVALID_CREDITS_OFFERED],
    ['credits as string', { credits: '5' }, ErrorCode.INVALID_CREDITS_OFFERED],
    [
      'completeBy garbage',
      { completeBy: 'tomorrow' },
      ErrorCode.INVALID_COMPLETE_BY,
    ],
    [
      'completeBy not a string',
      { completeBy: 123 },
      ErrorCode.INVALID_COMPLETE_BY,
    ],
    [
      'completeBy in the past (F9.1.1)',
      { completeBy: EARLIER },
      ErrorCode.COMPLETE_BY_IN_PAST,
    ],
    [
      'completeBy exactly now (F9.1.1)',
      { completeBy: NOW.toISOString() },
      ErrorCode.COMPLETE_BY_IN_PAST,
    ],
    [
      'additionalDetails not text',
      { additionalDetails: 5 },
      ErrorCode.INVALID_ADDITIONAL_DETAILS,
    ],
  ])('rejects %s', async (_name, override, code) => {
    const { result, create, outbox } = await run({ ...valid, ...override });
    expect(result).toEqual({ ok: false, errors: [code] });
    expect(outbox.createMany).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
  });

  it('accepts null optional fields', async () => {
    const { result } = await run({
      ...valid,
      completeBy: null,
      additionalDetails: null,
    });
    expect(result.ok).toBe(true);
  });

  describe('default complete-by (2026-11-09)', () => {
    const CREATED_AT = new Date('2026-11-09T08:00:00.000Z');
    const ONE_HOUR_LATER = new Date('2026-11-09T09:00:00.000Z');

    beforeEach(() => {
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(CREATED_AT);
    });
    afterEach(() => {
      vi.useRealTimers();
    });

    it.each([
      ['absent', {}],
      ['null', { completeBy: null }],
    ])('stores now + 1 hour when completeBy is %s', async (_name, override) => {
      // `valid` has no completeBy of its own.
      const { result, create } = await run({ ...valid, ...override });
      expect(result.ok).toBe(true);
      expect(create).toHaveBeenCalledWith({
        data: expect.objectContaining({ completeBy: ONE_HOUR_LATER }),
      });
    });

    it('keeps a requester-chosen completeBy as given', async () => {
      const { create } = await run({ ...valid, completeBy: LATER });
      expect(create).toHaveBeenCalledWith({
        data: expect.objectContaining({ completeBy: new Date(LATER) }),
      });
    });
  });
});

describe('createOrder: synchronous credit reservation (2026-11-09)', () => {
  it('reserves in the request and returns the order already open', async () => {
    const deps = fakes();
    const { result } = await run(valid, deps);

    expect(deps.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ status: 'pending', credits: 4 }),
    });
    // The order id is the reservation's requestId (idempotency key).
    expect(deps.reserve).toHaveBeenCalledWith({
      requestId: 'generated',
      userId: REQUESTER,
      amount: 4,
    });
    expect(result).toMatchObject({ ok: true, order: { status: 'open' } });
    // No reserve task goes through the outbox any more.
    const tasks = deps.outbox.createMany.mock.calls.flatMap((call: unknown[]) =>
      (call[0] as { data: { taskName: string }[] }).data.map((t) => t.taskName),
    );
    expect(tasks).not.toContain('credit_reserve');
  });

  it('takes the per-requester lock before checking for a pending order', async () => {
    const deps = fakes();
    await run(valid, deps);
    expect(deps.$executeRaw).toHaveBeenCalledTimes(1);
    expect(deps.$executeRaw.mock.calls[0]).toContain(REQUESTER);
    expect(deps.findFirst).toHaveBeenCalledWith({
      where: { requesterId: REQUESTER, status: 'pending' },
      select: { id: true },
    });
  });

  it('rejects with ORDER_PENDING_EXISTS while the requester has a pending order', async () => {
    const deps = fakes({ pendingExists: true });
    const { result } = await run(valid, deps);
    expect(result).toEqual({
      ok: false,
      errors: [ErrorCode.ORDER_PENDING_EXISTS],
    });
    expect(deps.create).not.toHaveBeenCalled();
    expect(deps.reserve).not.toHaveBeenCalled();
  });

  it('fails the order with INSUFFICIENT_CREDITS when credit-service says so, without a release', async () => {
    const deps = fakes({
      reserve: async () => ({
        ok: false,
        kind: 'permanent',
        status: 422,
        code: 'INSUFFICIENT_UNRESERVED_CREDITS',
      }),
    });
    const { result } = await run(valid, deps);
    expect(result).toEqual({
      ok: false,
      errors: [ErrorCode.INSUFFICIENT_CREDITS],
    });
    expect(deps.row()).toMatchObject({ status: 'failed' });
    expect(deps.outbox.createMany).not.toHaveBeenCalled();
  });

  it('fails the order with CREDIT_RESERVE_REJECTED for any other refusal', async () => {
    const deps = fakes({
      reserve: async () => ({
        ok: false,
        kind: 'permanent',
        status: 400,
        code: 'VALIDATION_ERROR',
      }),
    });
    const { result } = await run(valid, deps);
    expect(result).toEqual({
      ok: false,
      errors: [ErrorCode.CREDIT_RESERVE_REJECTED],
    });
    expect(deps.row()).toMatchObject({ status: 'failed' });
  });

  it('fails the order and queues a release when credit-service is unreachable, with no retry', async () => {
    const deps = fakes({
      reserve: async () => ({
        ok: false,
        kind: 'transient',
        code: 'ECONNREFUSED',
      }),
    });
    const { result } = await run(valid, deps);
    expect(result).toEqual({
      ok: false,
      errors: [ErrorCode.CREDIT_SERVICE_UNAVAILABLE],
    });
    expect(deps.reserve).toHaveBeenCalledTimes(1);
    expect(deps.row()).toMatchObject({ status: 'failed' });
    expect(deps.outbox.createMany).toHaveBeenCalledWith(
      releaseRow('generated', 1),
    );
  });
});

describe('editOrder', () => {
  function prismaWithEdit({ updatedRows = 1 } = {}) {
    const order = {
      id: 'order-1',
      requesterId: REQUESTER,
      status: 'open',
      version: 3,
    } as OrderRequest;
    const findUniqueOrThrow = vi.fn(async () => order);
    const updateMany = vi.fn(async () => ({ count: updatedRows }));
    const prisma = {
      orderRequest: { findUniqueOrThrow, updateMany },
    } as unknown as PrismaClient;
    return { findUniqueOrThrow, updateMany, prisma, order };
  }

  it('trims details on edit and rejects invalid details', async () => {
    const { prisma, updateMany, findUniqueOrThrow, order } = prismaWithEdit();
    findUniqueOrThrow.mockResolvedValueOnce(order).mockResolvedValueOnce(order);
    expect(
      (
        await editOrderImpl(
          prisma,
          REQUESTER,
          order.id,
          { deliveryDetails: '  Lobby  ' },
          REFS,
        )
      ).ok,
    ).toBe(true);
    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ deliveryDetails: 'Lobby' }),
      }),
    );
    expect(
      await editOrderImpl(
        prisma,
        REQUESTER,
        order.id,
        { deliveryDetails: 'x'.repeat(251) },
        REFS,
      ),
    ).toEqual({ ok: false, errors: [ErrorCode.INVALID_DELIVERY_DETAILS] });
  });

  it('rejects unsupported fields before querying the database', async () => {
    const findUniqueOrThrow = vi.fn();
    const prisma = {
      orderRequest: { findUniqueOrThrow },
    } as unknown as PrismaClient;

    await expect(
      editWithDetails(
        prisma,
        REQUESTER,
        'order-1',
        {
          description: 'Updated description',
          unsupported: true,
        } as never,
        REFS,
      ),
    ).resolves.toEqual({
      ok: false,
      errors: [ErrorCode.INVALID_FIELD],
    });
    expect(findUniqueOrThrow).not.toHaveBeenCalled();
  });

  it.each([
    ['supplierId not an id', { supplierId: 'abc' }, ErrorCode.INVALID_SUPPLIER],
    ['supplierId zero', { supplierId: 0 }, ErrorCode.INVALID_SUPPLIER],
    [
      'supplierId beyond INTEGER',
      { supplierId: 2_147_483_648 },
      ErrorCode.INVALID_SUPPLIER,
    ],
    ['description empty', { description: '  ' }, ErrorCode.INVALID_DESCRIPTION],
    ['description not text', { description: 5 }, ErrorCode.INVALID_DESCRIPTION],
    [
      'additionalDetails not text',
      { additionalDetails: 5 },
      ErrorCode.INVALID_ADDITIONAL_DETAILS,
    ],
    [
      'deliveryLocationId not an id',
      { deliveryLocationId: 'COM1' },
      ErrorCode.INVALID_DELIVERY_LOCATION,
    ],
  ])(
    'rejects %s before querying the database',
    async (_name, payload, code) => {
      const findUniqueOrThrow = vi.fn();
      const prisma = {
        orderRequest: { findUniqueOrThrow },
      } as unknown as PrismaClient;

      await expect(
        editWithDetails(prisma, REQUESTER, 'order-1', payload as never, REFS),
      ).resolves.toEqual({ ok: false, errors: [code] });
      expect(findUniqueOrThrow).not.toHaveBeenCalled();
    },
  );

  it('accepts null additionalDetails and a valid supplierId', async () => {
    const { prisma, updateMany, findUniqueOrThrow, order } = prismaWithEdit();
    findUniqueOrThrow.mockResolvedValueOnce(order).mockResolvedValueOnce(order);

    await expect(
      editWithDetails(
        prisma,
        REQUESTER,
        order.id,
        {
          supplierId: 3,
          additionalDetails: null,
        },
        REFS,
      ),
    ).resolves.toMatchObject({ ok: true });
    expect(updateMany).toHaveBeenCalled();
  });

  it('rejects editing credits, which are fixed at creation (issue #4)', async () => {
    const findUniqueOrThrow = vi.fn();
    const prisma = {
      orderRequest: { findUniqueOrThrow },
    } as unknown as PrismaClient;

    await expect(
      editWithDetails(prisma, REQUESTER, 'order-1', { credits: 8 }, REFS),
    ).resolves.toEqual({ ok: false, errors: [ErrorCode.INVALID_FIELD] });
    expect(findUniqueOrThrow).not.toHaveBeenCalled();
  });

  it('updates only the fetched version and increments it', async () => {
    const { prisma, updateMany, findUniqueOrThrow, order } = prismaWithEdit();
    const updatedOrder = {
      ...order,
      description: 'Updated description',
      version: 4,
    };
    findUniqueOrThrow
      .mockResolvedValueOnce(order)
      .mockResolvedValueOnce(updatedOrder);

    await expect(
      editWithDetails(
        prisma,
        REQUESTER,
        order.id,
        {
          description: 'Updated description',
        },
        REFS,
      ),
    ).resolves.toEqual({ ok: true, order: updatedOrder });

    expect(updateMany).toHaveBeenCalledWith({
      where: { id: order.id, version: order.version, status: 'open' },
      data: {
        description: 'Updated description',
        deliveryDetails: 'Nil',
        version: { increment: 1 },
      },
    });
    expect(findUniqueOrThrow).toHaveBeenCalledTimes(2);
  });

  it('keeps the stored completeBy when the edit sends completeBy: null (2026-11-09)', async () => {
    const { prisma, updateMany, findUniqueOrThrow, order } = prismaWithEdit();
    findUniqueOrThrow.mockResolvedValueOnce(order).mockResolvedValueOnce(order);

    await expect(
      editWithDetails(
        prisma,
        REQUESTER,
        order.id,
        { description: 'Updated description', completeBy: null },
        REFS,
      ),
    ).resolves.toMatchObject({ ok: true });
    expect(updateMany).toHaveBeenCalledWith({
      where: { id: order.id, version: order.version, status: 'open' },
      data: {
        description: 'Updated description',
        deliveryDetails: 'Nil',
        version: { increment: 1 },
      },
    });
  });

  it('writes a new completeBy when the edit sends one', async () => {
    const { prisma, updateMany, findUniqueOrThrow, order } = prismaWithEdit();
    findUniqueOrThrow.mockResolvedValueOnce(order).mockResolvedValueOnce(order);

    await expect(
      editWithDetails(prisma, REQUESTER, order.id, { completeBy: LATER }, REFS),
    ).resolves.toMatchObject({ ok: true });
    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ completeBy: LATER }),
      }),
    );
  });

  it('returns FORBIDDEN when the actor is not the requester', async () => {
    const { prisma, updateMany, order } = prismaWithEdit();

    await expect(
      editWithDetails(
        prisma,
        OTHER_USER,
        order.id,
        {
          description: 'Updated description',
        },
        REFS,
      ),
    ).resolves.toEqual({
      ok: false,
      errors: [ErrorCode.FORBIDDEN],
    });

    expect(updateMany).not.toHaveBeenCalled();
  });

  it.each([
    'pending',
    'accepted',
    'picked_up',
    'delivered',
    'completed',
    'cancelled',
    'expired',
    'failed',
  ] as const)('refuses to edit a %s request (F18.1.1)', async (status) => {
    const { prisma, updateMany, order } = prismaWithEdit();
    order.status = status;

    await expect(
      editWithDetails(prisma, REQUESTER, order.id, { description: 'x' }, REFS),
    ).resolves.toEqual({
      ok: false,
      errors: [ErrorCode.ORDER_NOT_EDITABLE],
    });
    expect(updateMany).not.toHaveBeenCalled();
  });

  it('returns ORDER_CONFLICT when the fetched version is stale', async () => {
    const { prisma, updateMany, findUniqueOrThrow, order } = prismaWithEdit({
      updatedRows: 0,
    });

    await expect(
      editWithDetails(
        prisma,
        REQUESTER,
        order.id,
        {
          description: 'Updated description',
        },
        REFS,
      ),
    ).resolves.toEqual({
      ok: false,
      errors: [ErrorCode.ORDER_CONFLICT],
    });

    expect(updateMany).toHaveBeenCalledWith({
      where: { id: order.id, version: order.version, status: 'open' },
      data: {
        description: 'Updated description',
        deliveryDetails: 'Nil',
        version: { increment: 1 },
      },
    });
    expect(findUniqueOrThrow).toHaveBeenCalledTimes(1);
  });

  it('returns ORDER_NOT_FOUND when the order does not exist', async () => {
    const findUniqueOrThrow = vi.fn(async () => {
      throw new Prisma.PrismaClientKnownRequestError('not found', {
        code: 'P2025',
        clientVersion: '7.10.0',
      });
    });
    const prisma = {
      orderRequest: { findUniqueOrThrow },
    } as unknown as PrismaClient;

    await expect(
      editWithDetails(
        prisma,
        REQUESTER,
        'missing-order',
        {
          description: 'Updated description',
        },
        REFS,
      ),
    ).resolves.toEqual({
      ok: false,
      errors: [ErrorCode.ORDER_NOT_FOUND],
    });
  });
});

describe('supplier-service reference check (create / edit)', () => {
  /** A client answering `supplier` / `location` for every id, recording the calls. */
  function suppliersAnswering(supplier: Existence, location: Existence) {
    const client = {
      supplierExists: vi.fn(async () => supplier),
      locationExists: vi.fn(async () => location),
      supplierStatusForWorker: vi.fn(async () => ({
        existence: supplier,
        hasNoOpeningHours: false,
        closed: false,
        nextOpeningAt: null,
      })),
      locationExistsForWorker: vi.fn(async () => location),
    } satisfies SuppliersClient;
    return { client, refs: { suppliers: client, authorization: 'Bearer abc' } };
  }

  function openOrder(requesterId = REQUESTER) {
    const order = {
      id: 'order-1',
      requesterId,
      status: 'open',
      version: 3,
    } as OrderRequest;
    const findUniqueOrThrow = vi.fn(async () => order);
    const updateMany = vi.fn(async () => ({ count: 1 }));
    const prisma = {
      orderRequest: { findUniqueOrThrow, updateMany },
    } as unknown as PrismaClient;
    return { prisma, updateMany };
  }

  it('create checks both ids with the caller token, then writes', async () => {
    const { client, refs } = suppliersAnswering('found', 'found');
    const deps = fakes();
    const result = await createOrder(
      deps.prisma,
      REQUESTER,
      valid,
      refs,
      deps.credits,
    );
    expect(result.ok).toBe(true);
    expect(client.supplierExists).toHaveBeenCalledWith(SUPPLIER, 'Bearer abc');
    expect(client.locationExists).toHaveBeenCalledWith(12, 'Bearer abc');
  });

  it.each([
    ['not_found', 'found', [ErrorCode.SUPPLIER_NOT_FOUND]],
    ['found', 'not_found', [ErrorCode.DELIVERY_LOCATION_NOT_FOUND]],
    [
      'not_found',
      'not_found',
      [ErrorCode.SUPPLIER_NOT_FOUND, ErrorCode.DELIVERY_LOCATION_NOT_FOUND],
    ],
    ['unavailable', 'found', [ErrorCode.SUPPLIER_SERVICE_UNAVAILABLE]],
    ['found', 'unavailable', [ErrorCode.SUPPLIER_SERVICE_UNAVAILABLE]],
    // unavailable wins: a half-answered check is not reported as "not found"
    ['not_found', 'unavailable', [ErrorCode.SUPPLIER_SERVICE_UNAVAILABLE]],
  ] as const)(
    'create: supplier %s, location %s -> %j, nothing written',
    async (supplier, location, errors) => {
      const { refs } = suppliersAnswering(supplier, location);
      const deps = fakes();
      await expect(
        createOrder(deps.prisma, REQUESTER, valid, refs, deps.credits),
      ).resolves.toEqual({ ok: false, errors });
      expect(deps.$transaction).not.toHaveBeenCalled();
    },
  );

  it('create skips the remote check when the payload is already invalid', async () => {
    const { client, refs } = suppliersAnswering('found', 'found');
    const deps = fakes();
    await createOrder(
      deps.prisma,
      REQUESTER,
      { ...valid, supplierId: -1 } as CreateOrderPayload,
      refs,
      deps.credits,
    );
    expect(client.supplierExists).not.toHaveBeenCalled();
    expect(client.locationExists).not.toHaveBeenCalled();
  });

  it('edit checks only the ids it changes', async () => {
    const { client, refs } = suppliersAnswering('found', 'found');
    const { prisma } = openOrder();
    await editWithDetails(
      prisma,
      REQUESTER,
      'order-1',
      { supplierId: 3 },
      refs,
    );
    expect(client.supplierExists).toHaveBeenCalledWith(3, 'Bearer abc');
    expect(client.locationExists).not.toHaveBeenCalled();

    client.supplierExists.mockClear();
    await editWithDetails(
      prisma,
      REQUESTER,
      'order-1',
      { description: 'x' },
      refs,
    );
    expect(client.supplierExists).not.toHaveBeenCalled();
    expect(client.locationExists).not.toHaveBeenCalled();
  });

  it('edit rejects an unknown location without writing', async () => {
    const { refs } = suppliersAnswering('found', 'not_found');
    const { prisma, updateMany } = openOrder();
    await expect(
      editWithDetails(
        prisma,
        REQUESTER,
        'order-1',
        { deliveryLocationId: 99 },
        refs,
      ),
    ).resolves.toEqual({
      ok: false,
      errors: [ErrorCode.DELIVERY_LOCATION_NOT_FOUND],
    });
    expect(updateMany).not.toHaveBeenCalled();
  });

  it('edit does not call supplier-service for a caller who may not edit', async () => {
    const { client, refs } = suppliersAnswering('found', 'found');
    const { prisma } = openOrder();
    await expect(
      editWithDetails(prisma, OTHER_USER, 'order-1', { supplierId: 3 }, refs),
    ).resolves.toEqual({ ok: false, errors: [ErrorCode.FORBIDDEN] });
    expect(client.supplierExists).not.toHaveBeenCalled();
  });
});

describe('runRequestMaintenance', () => {
  it('queues a credit release in the same transaction as the expiry', async () => {
    const open = {
      id: 'open-order',
      status: 'open',
      requesterId: REQUESTER,
      courierId: null,
      version: 2,
      completeBy: new Date('2026-10-12T11:00:00.000Z'),
    } as OrderRequest;
    const findMany = vi
      .fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([open]);
    const findUnique = vi.fn().mockResolvedValueOnce(open);
    const updateMany = vi.fn().mockResolvedValue({ count: 1 });
    const prisma = withTx({
      orderRequest: {
        findMany,
        findUnique,
        updateMany,
        findUniqueOrThrow: vi.fn().mockResolvedValue({
          ...open,
          status: 'expired',
        }),
      },
    });
    const now = new Date('2026-10-12T12:00:00.000Z');

    await expect(runRequestMaintenance(prisma, now)).resolves.toEqual({
      completed: 0,
      expired: 1,
    });

    expect(updateMany).toHaveBeenCalledWith({
      where: { id: open.id, version: open.version },
      data: { status: 'expired', version: { increment: 1 } },
    });
    expect(outboxOf(prisma).createMany).toHaveBeenCalledWith({
      data: [
        ...releaseRow(open.id, 3).data,
        notificationRow(open.id, 3, 'The order has expired'),
      ],
    });
  });

  it('expires at the exact delivery deadline', async () => {
    const open = {
      id: 'open-order',
      status: 'open',
      requesterId: REQUESTER,
      courierId: null,
      version: 2,
      completeBy: new Date('2026-10-12T12:00:00.000Z'),
    } as OrderRequest;
    const findMany = vi
      .fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([open]);
    const prisma = withTx({
      orderRequest: {
        findMany,
        findUnique: vi.fn().mockResolvedValueOnce(open),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        findUniqueOrThrow: vi.fn().mockResolvedValue({
          ...open,
          status: 'expired',
        }),
      },
    });

    await expect(
      runRequestMaintenance(prisma, new Date('2026-10-12T12:00:00.000Z')),
    ).resolves.toEqual({ completed: 0, expired: 1 });
  });

  it('does not expire an open request before its delivery deadline', async () => {
    const findMany = vi
      .fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);
    const findUnique = vi.fn();
    const updateMany = vi.fn();
    const prisma = withTx({
      orderRequest: {
        findMany,
        findUnique,
        updateMany,
      },
    });

    await expect(
      runRequestMaintenance(prisma, new Date('2026-10-12T11:59:59.999Z')),
    ).resolves.toEqual({ completed: 0, expired: 0 });

    expect(findUnique).not.toHaveBeenCalled();
    expect(updateMany).not.toHaveBeenCalled();
  });

  it('queues no release when expiry loses the optimistic-lock race', async () => {
    const open = {
      id: 'open-order',
      status: 'open',
      requesterId: REQUESTER,
      courierId: null,
      version: 2,
      completeBy: new Date('2026-10-12T11:00:00.000Z'),
    } as OrderRequest;
    const findMany = vi
      .fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([open]);
    const prisma = withTx({
      orderRequest: {
        findMany,
        findUnique: vi.fn().mockResolvedValueOnce(open),
        updateMany: vi.fn().mockResolvedValue({ count: 0 }),
      },
    });

    await expect(
      runRequestMaintenance(prisma, new Date('2026-10-12T12:00:00.000Z')),
    ).resolves.toEqual({ completed: 0, expired: 0 });

    expect(outboxOf(prisma).createMany).not.toHaveBeenCalled();
  });

  it('uses system transitions for delivered and expired requests', async () => {
    const delivered = {
      id: 'delivered-order',
      status: 'delivered',
      requesterId: REQUESTER,
      courierId: null,
      version: 1,
    } as OrderRequest;
    const open = {
      id: 'open-order',
      status: 'open',
      requesterId: REQUESTER,
      courierId: null,
      version: 2,
      completeBy: new Date('2026-10-12T11:00:00.000Z'),
    } as OrderRequest;
    const findMany = vi
      .fn()
      .mockResolvedValueOnce([delivered])
      .mockResolvedValueOnce([open]);
    const findUnique = vi
      .fn()
      .mockResolvedValueOnce(delivered)
      .mockResolvedValueOnce(open)
      .mockResolvedValueOnce({ ...open, status: 'expired' });
    const updateMany = vi.fn().mockResolvedValue({ count: 1 });
    const prisma = withTx({
      orderRequest: {
        findMany,
        findUnique,
        updateMany,
        findUniqueOrThrow: vi.fn(),
      },
    });
    const now = new Date('2026-10-12T12:00:00.000Z');

    await expect(runRequestMaintenance(prisma, now)).resolves.toEqual({
      completed: 1,
      expired: 1,
    });

    expect(findMany).toHaveBeenNthCalledWith(1, {
      where: {
        status: 'delivered',
        deliveredAt: { lte: new Date('2026-10-11T12:00:00.000Z') },
      },
    });
    expect(findMany).toHaveBeenNthCalledWith(2, {
      where: {
        status: 'open',
        completeBy: { not: null, lte: now },
      },
    });
    expect(updateMany).toHaveBeenNthCalledWith(1, {
      where: { id: delivered.id, version: delivered.version },
      data: {
        status: 'completed',
        version: { increment: 1 },
      },
    });
    expect(updateMany).toHaveBeenNthCalledWith(2, {
      where: { id: open.id, version: open.version },
      data: {
        status: 'expired',
        version: { increment: 1 },
      },
    });
  });

  it('does not count a transition that loses an optimistic-lock race', async () => {
    const delivered = {
      id: 'delivered-order',
      status: 'delivered',
      requesterId: REQUESTER,
      courierId: null,
      version: 1,
    } as OrderRequest;
    const findMany = vi
      .fn()
      .mockResolvedValueOnce([delivered])
      .mockResolvedValueOnce([]);
    const prisma = withTx({
      orderRequest: {
        findMany,
        findUnique: vi.fn().mockResolvedValue(delivered),
        updateMany: vi.fn().mockResolvedValue({ count: 0 }),
      },
    });

    await expect(
      runRequestMaintenance(prisma, new Date('2026-10-12T12:00:00.000Z')),
    ).resolves.toEqual({
      completed: 0,
      expired: 0,
    });
  });
});

describe('transitionOrder', () => {
  const orderId = '0192f0c4-0000-7000-8000-000000000001';
  const requesterId = '0192f0c4-0000-7000-8000-00000000000a';
  const courierId = '0192f0c4-0000-7000-8000-00000000000b';

  function prismaWithTransition(
    current: Partial<OrderRequest> | null,
    { updatedRows = 1 } = {},
  ) {
    const row =
      current && ({ id: orderId, version: 3, ...current } as OrderRequest);
    const orderRequest = {
      findUnique: vi.fn(async () => row),
      updateMany: vi.fn(async () => ({ count: updatedRows })),
      findUniqueOrThrow: vi.fn(async () => ({ ...row, status: 'picked_up' })),
    };

    return {
      prisma: withTx({ orderRequest }),
      orderRequest,
    };
  }

  it.each([
    ['the requester', requesterId],
    ['the system (auto-complete)', 'system'],
  ])(
    'completing a delivered order as %s queues the credit transfer to the courier',
    async (_who, actor) => {
      const { prisma } = prismaWithTransition({
        status: 'delivered',
        requesterId,
        courierId,
      });

      await expect(
        transitionOrder(prisma, orderId, 'completed', actor),
      ).resolves.toMatchObject({ ok: true });
      expect(outboxOf(prisma).createMany).toHaveBeenCalledWith({
        data: [
          expect.objectContaining({
            taskName: 'credit_transfer',
            payload: { requestId: orderId, courierId },
          }),
          notificationRow(
            orderId,
            4,
            'The order has been marked as completed',
            true,
            actor === 'system' ? undefined : actor,
          ),
        ],
      });
    },
  );

  it('a transition other than completion queues no transfer', async () => {
    const { prisma } = prismaWithTransition({
      status: 'picked_up',
      requesterId,
      courierId,
    });

    await transitionOrder(prisma, orderId, 'delivered', courierId);
    expect(outboxOf(prisma).createMany).toHaveBeenCalledWith({
      data: [
        notificationRow(
          orderId,
          4,
          'The order has been delivered',
          false,
          courierId,
        ),
      ],
    });
  });

  it('returns ORDER_NOT_FOUND when the order does not exist', async () => {
    const { prisma, orderRequest } = prismaWithTransition(null);

    await expect(
      transitionOrder(prisma, orderId, 'accepted', courierId),
    ).resolves.toEqual({ ok: false, error: ErrorCode.ORDER_NOT_FOUND });
    expect(orderRequest.updateMany).not.toHaveBeenCalled();
  });

  it('returns INVALID_TRANSITION when the status edge is not allowed', async () => {
    const { prisma, orderRequest } = prismaWithTransition({
      status: 'open',
      requesterId,
      courierId: null,
    });

    await expect(
      transitionOrder(prisma, orderId, 'delivered', courierId),
    ).resolves.toEqual({ ok: false, error: ErrorCode.INVALID_TRANSITION });
    expect(orderRequest.updateMany).not.toHaveBeenCalled();
  });

  it('returns FORBIDDEN when the actor is not allowed to transition the order', async () => {
    const { prisma, orderRequest } = prismaWithTransition({
      status: 'open',
      requesterId,
      courierId: null,
    });

    await expect(
      transitionOrder(prisma, orderId, 'accepted', requesterId),
    ).resolves.toEqual({ ok: false, error: ErrorCode.FORBIDDEN });
    expect(orderRequest.updateMany).not.toHaveBeenCalled();
  });

  it('updates the order and sets the courier and acceptedAt values', async () => {
    const { prisma, orderRequest } = prismaWithTransition({
      status: 'open',
      requesterId,
      courierId: null,
    });

    const result = await transitionOrder(
      prisma,
      orderId,
      'accepted',
      courierId,
    );

    expect(orderRequest.updateMany).toHaveBeenCalledWith({
      where: { id: orderId, version: 3 },
      data: {
        status: 'accepted',
        version: { increment: 1 },
        courierId,
        acceptedAt: expect.any(Date),
      },
    });
    expect(result).toMatchObject({ ok: true, order: { status: 'picked_up' } });
  });

  it('allows the requester to cancel an open order', async () => {
    const { prisma, orderRequest } = prismaWithTransition({
      status: 'open',
      requesterId,
      courierId: null,
    });

    const result = await transitionOrder(
      prisma,
      orderId,
      'cancelled',
      requesterId,
    );

    expect(orderRequest.updateMany).toHaveBeenCalledWith({
      where: { id: orderId, version: 3 },
      data: {
        status: 'cancelled',
        version: { increment: 1 },
      },
    });
    expect(result).toMatchObject({ ok: true });
  });

  it('queues a credit release with a successful cancellation of a funded order', async () => {
    const { prisma } = prismaWithTransition({
      status: 'open',
      requesterId,
      courierId: null,
    });

    await expect(
      transitionOrder(
        prisma,
        orderId,
        'cancelled',
        requesterId,
        new Date('2026-10-13T12:00:00.000Z'),
      ),
    ).resolves.toMatchObject({ ok: true });

    expect(outboxOf(prisma).createMany).toHaveBeenCalledWith({
      data: [
        ...releaseRow(orderId, 4).data,
        notificationRow(
          orderId,
          4,
          'The order has been cancelled',
          true,
          requesterId,
        ),
      ],
    });
  });

  it('queues no release when cancellation loses the optimistic-lock race', async () => {
    const { prisma, orderRequest } = prismaWithTransition(
      {
        status: 'open',
        requesterId,
        courierId: null,
      },
      { updatedRows: 0 },
    );

    await expect(
      transitionOrder(
        prisma,
        orderId,
        'cancelled',
        requesterId,
        new Date('2026-10-13T12:00:00.000Z'),
      ),
    ).resolves.toEqual({ ok: false, error: ErrorCode.ORDER_CONFLICT });

    expect(outboxOf(prisma).createMany).not.toHaveBeenCalled();
    expect(orderRequest.findUniqueOrThrow).not.toHaveBeenCalled();
  });

  it('queues no credit task for transitions that do not end the order', async () => {
    const { prisma } = prismaWithTransition({
      status: 'open',
      requesterId,
      courierId: null,
    });

    await transitionOrder(prisma, orderId, 'accepted', courierId);

    expect(outboxOf(prisma).createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          taskName: 'chat_participant',
          payload: { orderId, userId: courierId, role: 'COURIER' },
        }),
        notificationRow(
          orderId,
          4,
          'The order has been accepted',
          false,
          courierId,
        ),
      ],
    });
  });

  it('fails a pending order without a release unless asked (permanent reserve failure)', async () => {
    const { prisma } = prismaWithTransition({
      status: 'pending',
      requesterId,
      courierId: null,
    });

    await expect(
      transitionOrder(prisma, orderId, 'failed', 'system'),
    ).resolves.toMatchObject({ ok: true });
    expect(outboxOf(prisma).createMany).not.toHaveBeenCalled();
  });

  it('fails a pending order with a release when asked (reserve retries exhausted)', async () => {
    const { prisma } = prismaWithTransition({
      status: 'pending',
      requesterId,
      courierId: null,
    });

    await expect(
      transitionOrder(prisma, orderId, 'failed', 'system', new Date(), {
        releaseCredits: true,
      }),
    ).resolves.toMatchObject({ ok: true });
    expect(outboxOf(prisma).createMany).toHaveBeenCalledWith(
      releaseRow(orderId, 4),
    );
  });

  it('only lets the system settle a pending order', async () => {
    const { prisma, orderRequest } = prismaWithTransition({
      status: 'pending',
      requesterId,
      courierId: null,
    });

    await expect(
      transitionOrder(prisma, orderId, 'failed', requesterId),
    ).resolves.toEqual({ ok: false, error: ErrorCode.FORBIDDEN });
    await expect(
      transitionOrder(prisma, orderId, 'completed', 'system'),
    ).resolves.toEqual({ ok: false, error: ErrorCode.INVALID_TRANSITION });
    await expect(
      transitionOrder(prisma, orderId, 'accepted', courierId),
    ).resolves.toEqual({ ok: false, error: ErrorCode.INVALID_TRANSITION });
    expect(orderRequest.updateMany).not.toHaveBeenCalled();
  });

  it('cancels at the exact complete-by deadline', async () => {
    const deadline = new Date('2026-10-13T12:00:00.000Z');
    const { prisma } = prismaWithTransition({
      status: 'accepted',
      requesterId,
      courierId,
      completeBy: deadline,
    });

    await expect(
      transitionOrder(prisma, orderId, 'cancelled', requesterId, deadline),
    ).resolves.toMatchObject({ ok: true });
  });

  it('rejects ongoing cancellation when complete-by is missing', async () => {
    const { prisma, orderRequest } = prismaWithTransition({
      status: 'picked_up',
      requesterId,
      courierId,
      completeBy: null,
    });

    await expect(
      transitionOrder(
        prisma,
        orderId,
        'cancelled',
        requesterId,
        new Date('2026-10-13T12:00:00.000Z'),
      ),
    ).resolves.toEqual({
      ok: false,
      error: ErrorCode.DEADLINE_NOT_REACHED,
    });
    expect(orderRequest.updateMany).not.toHaveBeenCalled();
  });

  it.each(['completed', 'expired', 'cancelled'] as RequestStatus[])(
    'rejects cancellation from terminal status %s',
    async (status) => {
      const { prisma, orderRequest } = prismaWithTransition({
        status,
        requesterId,
        courierId,
        completeBy: new Date('2026-10-13T10:00:00.000Z'),
      });

      await expect(
        transitionOrder(
          prisma,
          orderId,
          'cancelled',
          requesterId,
          new Date('2026-10-13T12:00:00.000Z'),
        ),
      ).resolves.toEqual({
        ok: false,
        error: ErrorCode.INVALID_TRANSITION,
      });
      expect(orderRequest.updateMany).not.toHaveBeenCalled();
    },
  );

  it('rejects cancelling a non-open order before its complete-by deadline', async () => {
    const { prisma, orderRequest } = prismaWithTransition({
      status: 'accepted',
      requesterId,
      courierId,
      completeBy: new Date('2026-10-08T14:00:00.000Z'),
    });

    await expect(
      transitionOrder(
        prisma,
        orderId,
        'cancelled',
        requesterId,
        new Date('2026-10-08T12:00:00.000Z'),
      ),
    ).resolves.toEqual({ ok: false, error: ErrorCode.DEADLINE_NOT_REACHED });
    expect(orderRequest.updateMany).not.toHaveBeenCalled();
  });

  it('allows the requester to cancel a non-open order after its complete-by deadline', async () => {
    const { prisma, orderRequest } = prismaWithTransition({
      status: 'accepted',
      requesterId,
      courierId,
      completeBy: new Date('2026-10-08T11:00:00.000Z'),
    });

    const result = await transitionOrder(
      prisma,
      orderId,
      'cancelled',
      requesterId,
      new Date('2026-10-08T12:00:00.000Z'),
    );

    expect(orderRequest.updateMany).toHaveBeenCalledWith({
      where: { id: orderId, version: 3 },
      data: {
        status: 'cancelled',
        version: { increment: 1 },
      },
    });
    expect(result).toMatchObject({ ok: true });
  });

  it('does not allow a courier to cancel a request after its deadline', async () => {
    const { prisma, orderRequest } = prismaWithTransition({
      status: 'accepted',
      requesterId,
      courierId,
      completeBy: new Date('2026-10-08T11:00:00.000Z'),
    });

    await expect(
      transitionOrder(
        prisma,
        orderId,
        'cancelled',
        courierId,
        new Date('2026-10-08T12:00:00.000Z'),
      ),
    ).resolves.toEqual({ ok: false, error: ErrorCode.FORBIDDEN });
    expect(orderRequest.updateMany).not.toHaveBeenCalled();
  });

  it('returns ORDER_CONFLICT when optimistic locking fails', async () => {
    const { prisma, orderRequest } = prismaWithTransition(
      {
        status: 'open',
        requesterId,
        courierId: null,
      },
      { updatedRows: 0 },
    );

    await expect(
      transitionOrder(prisma, orderId, 'accepted', courierId),
    ).resolves.toEqual({ ok: false, error: ErrorCode.ORDER_CONFLICT });
    expect(orderRequest.findUniqueOrThrow).not.toHaveBeenCalled();
  });
  describe('status notification text', () => {
    it.each([
      [
        'open',
        'accepted',
        OTHER_USER,
        'The order has been accepted by courier',
      ],
      ['accepted', 'picked_up', OTHER_USER, 'The order has been picked up'],
      ['picked_up', 'delivered', OTHER_USER, 'The order has been delivered'],
    ] as const)('%s -> %s', async (status, to, actor, message) => {
      const { prisma } = prismaWithTransition({
        status,
        requesterId: REQUESTER,
        courierId: status === 'open' ? null : actor,
      });
      const result = await transitionOrder(
        prisma,
        '0192f0c4-0000-7000-8000-000000000001',
        to,
        actor,
        new Date(),
        { acceptanceUsername: async () => 'courier' },
      );
      expect(result.ok).toBe(true);
      expect(outboxOf(prisma).createMany).toHaveBeenCalledWith({
        data: [
          ...(to === 'accepted'
            ? [expect.objectContaining({ taskName: 'chat_participant' })]
            : []),
          expect.objectContaining({
            payload: expect.objectContaining({ message }),
          }),
        ],
      });
    });
    it('uses acceptance fallback when username lookup throws', async () => {
      const { prisma } = prismaWithTransition({
        status: 'open',
        requesterId: REQUESTER,
        courierId: null,
      });
      await transitionOrder(
        prisma,
        '0192f0c4-0000-7000-8000-000000000001',
        'accepted',
        OTHER_USER,
        new Date(),
        {
          acceptanceUsername: async () => {
            throw new Error('unavailable');
          },
        },
      );
      expect(outboxOf(prisma).createMany).toHaveBeenCalledWith({
        data: [
          expect.objectContaining({ taskName: 'chat_participant' }),
          expect.objectContaining({
            payload: expect.objectContaining({
              message: 'The order has been accepted',
            }),
          }),
        ],
      });
    });
  });
});

// AI-generated
function notificationRow(
  orderId: string,
  version: number,
  message: string,
  archiveAfter = false,
  triggeredByUserId?: string,
) {
  return {
    taskName: 'chat_notification',
    version,
    payload: {
      orderId,
      message,
      ...(archiveAfter ? { archiveAfter: true } : {}),
      ...(triggeredByUserId ? { triggeredByUserId } : {}),
      messageId: expect.stringMatching(/^[0-9a-f-]{36}$/),
    },
  };
}
