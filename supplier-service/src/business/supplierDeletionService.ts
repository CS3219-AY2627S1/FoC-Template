/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: claude-sonnet-5-5), date: 2026-09-30
 * Scope: Supplier soft-delete workflow (Phase 4 plan Task 5); SupplierServiceArchitecture.md §7.5,
 *        §8.1. The suspension task is committed to the outbox by the same transaction as the delete
 *        (team answer, 2026-09-30). No requirements, architecture, schema, or API decisions were made
 *        by the AI tool.
 * Author review:
 */
import type { SupplierWriteRepository } from '../persistence/supplierWriteRepository.js';
import { buildSuspensionTask } from '../queue/tasks.js';
import { AppError } from '../utils/AppError.js';
import { sgtDatetime } from '../utils/time.js';

export interface DeleteResult {
  statusCode: 200;
  body: { id: number; isDeleted: true };
}

interface Dependencies {
  repo: Pick<SupplierWriteRepository, 'softDelete'>;
  clock?: () => Date;
}

export function createSupplierDeletionService({ repo, clock = () => new Date() }: Dependencies) {
  return {
    async deleteSupplier(supplierId: number): Promise<DeleteResult> {
      // The delete and its outbox row commit together; the relay enqueues the job afterwards.
      // A row that is unknown or already soft-deleted matches nothing: repeated DELETE → 404 (Arch §7.5).
      const changed = await repo.softDelete(supplierId, sgtDatetime(clock()), [buildSuspensionTask(supplierId)]);
      if (!changed) throw new AppError(404, 'Not Found', 'Supplier not found.');

      // Answered without waiting for the worker (Arch §8.1).
      return { statusCode: 200, body: { id: supplierId, isDeleted: true } };
    },
  };
}

export type SupplierDeletionService = ReturnType<typeof createSupplierDeletionService>;
