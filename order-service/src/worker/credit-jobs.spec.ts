/*
 * AI Assistance Disclosure:
 * Scope (2026-11-08, Codex, model: GPT-6): Updated test fixtures for precise delivery details.
 * No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review:
 * Tool: Claude Code (model: claude-opus-5-5), date: 2026-10-20
 * Scope: Issue #4 - unit tests for the credit_reserve / credit_release job handlers:
 *        each branch of George's saga decisions (success, permanent failure, transient
 *        retry, retries exhausted) and release outcomes.
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review: george-yeo
 * Scope (2026-10-20): Issue #6 - outcomes asserted as published order events (rooms and
 *        payload) instead of the removed log-only notifier.
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review: george-yeo
 * Scope (2026-10-20): `failed` status - reservation failures settle to `failed` and publish
 *        order:failed.
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review: george-yeo
 * Scope (2026-11-08, Codex, model: GPT-6): Implemented or tested the team-specified order chat delivery and message ID deduplication.
 * Author review: tng wen xi
 * Scope (2026-11-08, Codex, model: GPT-6): Tested status notification jobs and fallback text.
 * Author review: tng wen xi
 * Scope (2026-11-08, Codex, model: GPT-6): Implemented or tested team-specified order-based courier participant delivery.
 * Author review: tng wen xi
 * Scope (2026-11-08, Codex, model: GPT-6): Added tests for order-based participant delivery.
 * Author review: tng wen xi
 * Tool: Claude Code (model: claude-opus-5-5), date: 2026-11-09
 * Scope (2026-11-09): credit_reserve is no longer a worker job (createOrder reserves
 *        synchronously, George 2026-11-09); its cases are replaced by one asserting a
 *        leftover job fails without retries.
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review: George Yeo
 * Tool: Claude Code (model: claude-sonnet-5), date: 2026-11-09
 * Scope: Stage 28 e (instructions.md) - test for the extended chat_notification payload
 *        (orderId null + recipient, for series notices) via isChatNotificationPayload.
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review:
 * Scope (2026-11-10, Codex, model: GPT-6): Tested archive failure propagation through the notification worker.
 * Author review: tng wen xi
 */

import { UnrecoverableError } from 'bullmq';
import { createHttpChatClient } from '../clients/chat.client.js';
import type {
  CreditCallResult,
  CreditsClient,
} from '../clients/credits.client.js';
import type { PrismaClient } from '../db/prisma.js';
import type { OrderRequest } from '../generated/prisma/client.js';
import {
  createCreditJobProcessor,
  isFinalFailure,
  type CreditJob,
} from './credit-jobs.js';

const ORDER_ID = '0192f0c4-0000-7000-8000-000000000001';
const REQUESTER = '0192f0c4-0000-7000-8000-00000000000a';
const NOW = new Date('2026-10-20T12:00:00.000Z');

const reservePayload = { requestId: ORDER_ID, userId: REQUESTER, amount: 4 };

function job(
  name: string,
  data: unknown,
  { attemptsMade = 0, attempts = 5 } = {},
): CreditJob {
  return { id: 'outbox-1', name, data, attemptsMade, opts: { attempts } };
}

/** Fake Prisma whose order row changes status when transitionOrder writes it. */
function setup(
  status: OrderRequest['status'] | null,
  reserveResult: CreditCallResult = { ok: true },
  releaseResult: CreditCallResult = { ok: true },
) {
  let row: OrderRequest | null =
    status &&
    ({
      id: ORDER_ID,
      requesterId: REQUESTER,
      courierId: null,
      status,
      version: 0,
      updatedAt: NOW,
      createdAt: NOW,
      completeBy: null,
      supplierId: 9,
      description: '1x chicken rice',
      deliveryLocationId: 12,
      deliveryDetails: 'Nil',
      credits: 4,
      additionalDetails: null,
    } as OrderRequest);

  const outbox = { createMany: vi.fn(async () => ({ count: 1 })) };
  const orderRequest = {
    findUnique: vi.fn(async () => row),
    findUniqueOrThrow: vi.fn(async () => row),
    updateMany: vi.fn(
      async (args: {
        where: { version?: number };
        data: { status?: string };
      }) => {
        if (row && args.data.status && args.where.version === row.version) {
          row = {
            ...row,
            status: args.data.status as OrderRequest['status'],
            version: row.version + 1,
          };
        }
        return { count: 1 };
      },
    ),
  };
  const prisma: Record<string, unknown> = { orderRequest, outbox };
  prisma.$transaction = vi.fn(async (fn: (tx: unknown) => Promise<unknown>) =>
    fn(prisma),
  );

  const reserve = vi.fn(async () => reserveResult);
  const release = vi.fn(async () => releaseResult);
  const credits: CreditsClient = { reserve, release };
  const processJob = createCreditJobProcessor({
    prisma: prisma as unknown as PrismaClient,
    credits,
    clock: () => NOW,
  });
  return {
    processJob,
    prisma,
    reserve,
    release,
    outbox,
    orderRequest,
    row: () => row,
  };
}

describe('credit_reserve (removed 2026-11-09)', () => {
  it('is no longer handled: a leftover job fails without retries', async () => {
    const t = setup('pending');
    await expect(
      t.processJob(job('credit_reserve', reservePayload)),
    ).rejects.toBeInstanceOf(UnrecoverableError);
    expect(t.reserve).not.toHaveBeenCalled();
  });
});

describe('credit_release', () => {
  it('stamps creditReleasedAt once credit-service confirms', async () => {
    const t = setup('cancelled');
    await t.processJob(job('credit_release', { requestId: ORDER_ID }));

    expect(t.release).toHaveBeenCalledWith({ requestId: ORDER_ID });
    expect(t.orderRequest.updateMany).toHaveBeenCalledWith({
      where: { id: ORDER_ID, creditReleasedAt: null },
      data: { creditReleasedAt: NOW },
    });
  });

  it('throws to retry a transient failure', async () => {
    const t = setup(
      'cancelled',
      { ok: true },
      {
        ok: false,
        kind: 'transient',
        code: 'fetch failed',
      },
    );
    await expect(
      t.processJob(job('credit_release', { requestId: ORDER_ID })),
    ).rejects.not.toBeInstanceOf(UnrecoverableError);
    expect(t.orderRequest.updateMany).not.toHaveBeenCalled();
  });

  it('fails without retries on a permanent rejection', async () => {
    const t = setup(
      'cancelled',
      { ok: true },
      {
        ok: false,
        kind: 'permanent',
        status: 409,
        code: 'ALREADY_TRANSFERRED',
      },
    );
    await expect(
      t.processJob(job('credit_release', { requestId: ORDER_ID })),
    ).rejects.toBeInstanceOf(UnrecoverableError);
  });
});

describe('unknown tasks and final failures', () => {
  it('rejects an unknown task name without retries', async () => {
    const t = setup('pending');
    await expect(t.processJob(job('credit_adjust', {}))).rejects.toBeInstanceOf(
      UnrecoverableError,
    );
  });

  it('isFinalFailure: true when retries are used up or the error is unrecoverable', () => {
    expect(
      isFinalFailure(job('x', {}, { attemptsMade: 5 }), new Error('e')),
    ).toBe(true);
    expect(
      isFinalFailure(job('x', {}, { attemptsMade: 3 }), new Error('e')),
    ).toBe(false);
    expect(
      isFinalFailure(
        job('x', {}, { attemptsMade: 1 }),
        new UnrecoverableError('e'),
      ),
    ).toBe(true);
  });
});

// AI-generated
describe('chat_create', () => {
  const data = {
    orderId: ORDER_ID,
    requesterId: REQUESTER,
    orderDescription: 'Coffee',
    messageId: REQUESTER,
  };
  it('retries transient chat failures without changing the open order', async () => {
    const t = setup('open');
    const create = vi
      .fn()
      .mockResolvedValue({ ok: false, kind: 'transient', code: 'HTTP_503' });
    const process = createCreditJobProcessor({
      prisma: t.prisma as unknown as PrismaClient,
      credits: { reserve: t.reserve, release: t.release },
      chat: { create, notify: vi.fn(), addParticipant: vi.fn() },
    });
    await expect(process(job('chat_create', data))).rejects.toThrow(
      'transient',
    );
    expect(create).toHaveBeenCalledWith(data);
    expect(t.row()?.status).toBe('open');
    expect(t.outbox.createMany).not.toHaveBeenCalled();
  });
});

// AI-generated
describe('chat_notification', () => {
  it.each(['success', 'transient', 'permanent'] as const)(
    'handles %s and retains the message ID',
    async (kind) => {
      const t = setup('open');
      const notify = vi
        .fn()
        .mockResolvedValue(
          kind === 'success'
            ? { ok: true }
            : { ok: false, kind, code: 'HTTP_ERROR' },
        );
      const process = createCreditJobProcessor({
        prisma: t.prisma as unknown as PrismaClient,
        credits: { reserve: t.reserve, release: t.release },
        chat: { create: vi.fn(), notify, addParticipant: vi.fn() },
      });
      const data = {
        orderId: ORDER_ID,
        messageId: REQUESTER,
        message: 'The order has been delivered',
      };
      if (kind === 'success')
        await expect(
          process(job('chat_notification', data)),
        ).resolves.toBeUndefined();
      else if (kind === 'permanent')
        await expect(
          process(job('chat_notification', data)),
        ).rejects.toBeInstanceOf(UnrecoverableError);
      else
        await expect(process(job('chat_notification', data))).rejects.toThrow(
          'transient',
        );
      expect(notify).toHaveBeenCalledWith(data);
      expect(t.outbox.createMany).not.toHaveBeenCalled();
    },
  );

  // AI-generated (edited by <name>).
  it('accepts a series notice (orderId null, recipient set) and rejects one with neither', async () => {
    const t = setup('open');
    const notify = vi.fn().mockResolvedValue({ ok: true });
    const process = createCreditJobProcessor({
      prisma: t.prisma as unknown as PrismaClient,
      credits: { reserve: t.reserve, release: t.release },
      chat: { create: vi.fn(), notify, addParticipant: vi.fn() },
    });
    const seriesData = {
      orderId: null,
      recipient: REQUESTER,
      messageId: 'm-1',
      message: 'hi',
    };
    await expect(
      process(job('chat_notification', seriesData)),
    ).resolves.toBeUndefined();
    expect(notify).toHaveBeenCalledWith(seriesData);

    const invalid = { orderId: null, messageId: 'm-1', message: 'hi' };
    await expect(
      process(job('chat_notification', invalid)),
    ).rejects.toBeInstanceOf(UnrecoverableError);
  });
});

// AI-generated
describe('chat_participant', () => {
  it.each(['success', 'transient', 'permanent'] as const)(
    'handles %s without changing order state',
    async (kind) => {
      const t = setup('accepted');
      const addParticipant = vi.fn().mockResolvedValue(
        kind === 'success'
          ? { ok: true }
          : {
              ok: false,
              kind,
              status: kind === 'permanent' ? 409 : 503,
              code: 'HTTP_ERROR',
            },
      );
      const process = createCreditJobProcessor({
        prisma: t.prisma as unknown as PrismaClient,
        credits: { reserve: t.reserve, release: t.release },
        chat: { create: vi.fn(), notify: vi.fn(), addParticipant },
      });
      const data = { orderId: ORDER_ID, userId: REQUESTER, role: 'COURIER' };
      if (kind === 'success')
        await expect(
          process(job('chat_participant', data)),
        ).resolves.toBeUndefined();
      else if (kind === 'permanent')
        await expect(
          process(job('chat_participant', data)),
        ).rejects.toBeInstanceOf(UnrecoverableError);
      else
        await expect(process(job('chat_participant', data))).rejects.toThrow(
          'transient',
        );
      expect(addParticipant).toHaveBeenCalledWith(data);
      expect(t.row()?.status).toBe('accepted');
      expect(t.outbox.createMany).not.toHaveBeenCalled();
    },
  );
});

// AI-generated
it('retries the terminal notification job when archive fails, without changing the order', async () => {
  const t = setup('completed');
  const fetchImpl = vi
    .fn<typeof fetch>()
    .mockResolvedValueOnce(new Response('{}', { status: 201 }))
    .mockResolvedValueOnce(new Response('{}', { status: 503 }))
    .mockResolvedValueOnce(new Response('{}', { status: 200 }))
    .mockResolvedValueOnce(new Response('{}', { status: 200 }));
  const process = createCreditJobProcessor({
    prisma: t.prisma as unknown as PrismaClient,
    credits: { reserve: t.reserve, release: t.release },
    chat: createHttpChatClient('http://chat-service:3000', 'test', fetchImpl),
  });
  const data = {
    orderId: ORDER_ID,
    messageId: REQUESTER,
    message: 'The order has been marked as completed',
    archiveAfter: true,
  };
  await expect(process(job('chat_notification', data))).rejects.toThrow(
    'transient',
  );
  await expect(
    process(job('chat_notification', data, { attemptsMade: 1 })),
  ).resolves.toBeUndefined();
  expect(t.row()?.status).toBe('completed');
  expect(t.outbox.createMany).not.toHaveBeenCalled();
  expect(fetchImpl).toHaveBeenCalledTimes(4);
});
