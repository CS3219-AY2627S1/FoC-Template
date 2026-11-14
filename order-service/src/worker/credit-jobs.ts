/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: claude-opus-5-5), date: 2026-10-20
 * Scope: Issue #4 - worker handlers for the credit_reserve / credit_release jobs,
 *        implementing George's saga decisions (2026-10-19/20):
 *        - reserve ok (incl. RESERVATION_ALREADY_EXISTS): pending -> open (order:created);
 *        - reserve permanent failure (422/404): pending -> cancelled, no release, notify
 *          with credit-service's code;
 *        - reserve transient failure: retry; on the last attempt cancel, queue a release
 *          and notify, then fail the job so it is dead-lettered;
 *        - release ok (incl. 404/409): stamp creditReleasedAt; transient: retry;
 *          permanent: dead-letter without retries.
 *        Failure reason string RESERVE_RETRIES_EXHAUSTED is named by convention
 *        (UPPER_SNAKE like credit-service's codes).
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review: george-yeo
 * Scope (2026-10-20): Issue #6 - reservation outcomes are published as order events
 *        (order:created on success, order:cancelled with the reason on failure) through
 *        transitionOrder, replacing the log-only notifier from issue #4.
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review: george-yeo
 * Scope (2026-10-20): Exported the transient-release message so the dead-letter
 *        re-drive can select transient release failures only (George, 2026-10-20).
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review: george-yeo
 * Scope (2026-10-20): `failed` status - both reservation failure paths (credit-service
 *        rejection, retries exhausted) settle pending -> failed with the reason, published as
 *        order:failed (George, 2026-10-20).
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review: george-yeo
 * Scope (2026-11-08, Codex, model: GPT-6): Implemented or tested the team-specified order chat delivery and message ID deduplication.
 * Author review: tng wen xi
 * Scope (2026-11-08, Codex, model: GPT-6): Implemented team-specified status notifications and username fallback.
 * Author review: tng wen xi
 * Scope (2026-11-08, Codex, model: GPT-6): Implemented or tested team-specified order-based courier participant delivery.
 * Author review: tng wen xi
 * Tool: Claude Code (model: claude-opus-5-5), date: 2026-11-09
 * Scope (2026-11-09): Removed the credit_reserve job and its retry / retries-exhausted
 *        handling; createOrder now reserves synchronously (George, 2026-11-09). Release
 *        and chat jobs are unchanged.
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review: George Yeo
 * Tool: Claude Code (model: claude-sonnet-5), date: 2026-11-09
 * Scope: Stage 28 e (instructions.md) - chat_notification validation now uses
 *        isChatNotificationPayload (queue/tasks.ts), accepting the extended payload
 *        (nullable orderId + recipient) that series notices use. No requirements,
 *        architecture, schema, or API decisions were made by the AI tool.
 * Author review:
 */

import { UnrecoverableError, type Job } from 'bullmq';
import type { ChatClient } from '../clients/chat.client.js';
import type { ChatCreatePayload } from '../queue/tasks.js';
import {
  CHAT_NOTIFICATION_TASK,
  CHAT_PARTICIPANT_TASK,
  type ChatParticipantPayload,
  type ChatNotificationPayload,
  isChatNotificationPayload,
  CHAT_CREATE_TASK,
} from '../queue/tasks.js';
import type { CreditsClient } from '../clients/credits.client.js';
import type { PrismaClient } from '../db/prisma.js';
import { CREDIT_RELEASE_TASK, isReleasePayload } from '../queue/tasks.js';

/** Start of the error a transient release failure throws; the re-drive matches on it. */
export const TRANSIENT_RELEASE_FAILURE = 'Credit release failed (transient)';

export interface CreditJobDeps {
  prisma: PrismaClient;
  credits: CreditsClient;
  chat?: ChatClient;
  clock?: () => Date;
}

/** The subset of a BullMQ job the handlers read; keeps them testable without Redis. */
export type CreditJob = Pick<
  Job,
  'id' | 'name' | 'data' | 'attemptsMade' | 'opts'
>;

export function createCreditJobProcessor({
  prisma,
  credits,
  chat,
  clock = () => new Date(),
}: CreditJobDeps) {
  async function release(job: CreditJob): Promise<void> {
    if (!isReleasePayload(job.data)) {
      throw new UnrecoverableError(`Invalid ${CREDIT_RELEASE_TASK} payload.`);
    }
    const { requestId } = job.data;

    const result = await credits.release({ requestId });
    if (result.ok) {
      await prisma.orderRequest.updateMany({
        where: { id: requestId, creditReleasedAt: null },
        data: { creditReleasedAt: clock() },
      });
      return;
    }
    if (result.kind === 'permanent') {
      throw new UnrecoverableError(
        `Credit release rejected: ${result.status ?? ''} ${result.code}`.trim(),
      );
    }
    throw new Error(`${TRANSIENT_RELEASE_FAILURE}: ${result.code}`);
  }

  return async function processCreditJob(job: CreditJob): Promise<void> {
    switch (job.name) {
      // AI-generated
      case CHAT_PARTICIPANT_TASK: {
        const input = job.data as Partial<ChatParticipantPayload> | null;
        if (
          !input ||
          typeof input.orderId !== 'string' ||
          typeof input.userId !== 'string' ||
          input.role !== 'COURIER'
        )
          throw new UnrecoverableError('Invalid chat_participant payload.');
        if (!chat)
          throw new UnrecoverableError('Chat client is not configured.');
        const result = await chat.addParticipant(
          input as ChatParticipantPayload,
        );
        if (!result.ok) {
          if (result.kind === 'permanent')
            throw new UnrecoverableError(
              `Chat participant rejected: ${result.code}`,
            );
          throw new Error(
            `Chat participant failed (transient): ${result.code}`,
          );
        }
        return;
      }
      case CHAT_NOTIFICATION_TASK: {
        if (!isChatNotificationPayload(job.data))
          throw new UnrecoverableError('Invalid chat_notification payload.');
        if (!chat)
          throw new UnrecoverableError('Chat client is not configured.');
        const result = await chat.notify(job.data as ChatNotificationPayload);
        if (!result.ok) {
          if (result.kind === 'permanent')
            throw new UnrecoverableError(
              `Chat notification rejected: ${result.code}`,
            );
          throw new Error(
            `Chat notification failed (transient): ${result.code}`,
          );
        }
        return;
      }
      case CHAT_CREATE_TASK: {
        const input = job.data as Partial<ChatCreatePayload> | null;
        if (
          !input ||
          !['orderId', 'requesterId', 'orderDescription', 'messageId'].every(
            (key) => typeof input[key as keyof ChatCreatePayload] === 'string',
          )
        )
          throw new UnrecoverableError('Invalid chat_create payload.');
        if (!chat)
          throw new UnrecoverableError('Chat client is not configured.');
        const result = await chat.create(input as ChatCreatePayload);
        if (!result.ok) {
          if (result.kind === 'permanent')
            throw new UnrecoverableError(
              `Chat creation rejected: ${result.code}`,
            );
          throw new Error(`Chat creation failed (transient): ${result.code}`);
        }
        return;
      }
      case CREDIT_RELEASE_TASK:
        return release(job);
      default:
        throw new UnrecoverableError(`No handler for task_name "${job.name}".`);
    }
  };
}

/** True once BullMQ will not run the job again. */
export function isFinalFailure(job: CreditJob, err: Error): boolean {
  return (
    err instanceof UnrecoverableError ||
    job.attemptsMade >= (job.opts.attempts ?? 1)
  );
}
