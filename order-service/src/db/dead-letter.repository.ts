/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: claude-opus-5-5), date: 2026-10-20
 * Scope: Issue #4 - dead_letter_jobs writes, mirroring supplier-service's
 *        deadLetterRepository (same dead_letter_jobs solution, George 2026-10-20).
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review: george-yeo
 */

import type { Prisma } from '../generated/prisma/client.js';
import type { PrismaClient } from './prisma.js';

export interface DeadLetterInput {
  jobId: string;
  taskName: string;
  payload: unknown;
  errorTrace: string;
  failedAt: Date;
}

export interface DeadLetterRepository {
  insert(entry: DeadLetterInput): Promise<void>;
}

export function createDeadLetterRepository(
  prisma: PrismaClient,
): DeadLetterRepository {
  return {
    async insert(entry) {
      // status defaults to UNRESOLVED in the schema.
      await prisma.deadLetterJob.create({
        data: { ...entry, payload: entry.payload as Prisma.InputJsonValue },
      });
    },
  };
}
