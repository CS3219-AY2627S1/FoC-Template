/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: claude-sonnet-5), date: 2026-09-29
 * Scope: Controller for the admin supplier list and detail endpoints (Phase 2 plan Task 3;
 *        SupplierServiceArchitecture.md §7). Reuses the Phase 1 query validation. No requirements,
 *        architecture, schema, or API decisions were made by the AI tool.
 * Author review:
 * Scope (2026-09-29, Claude Code, model: claude-sonnet-5): added the create handler with
 *        Idempotency-Key handling per Phase 2 plan Task 8. No requirements, architecture, schema, or
 *        API decisions were made by the AI tool.
 * Author review:
 * Scope (2026-09-30, Claude Code, model: claude-sonnet-5-5): added the update handler per Phase 3 plan Task 7. No
 *        requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review:
 * Scope (2026-09-30, Claude Code, model: claude-sonnet-5-5): added the remove handler per Phase 4 plan Task 6. No requirements,
 *        architecture, schema, or API decisions were made by the AI tool.
 * Author review:
 */
import type { SupplierCreationService } from '../business/supplierCreationService.js';
import type { SupplierDeletionService } from '../business/supplierDeletionService.js';
import type { SupplierService } from '../business/supplierService.js';
import type { SupplierUpdateService } from '../business/supplierUpdateService.js';
import type { IdempotencyStore } from '../idempotency/idempotencyStore.js';
import type { PhotoFile } from '../storage/photoStorage.js';
import { AppError } from '../utils/AppError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { parseCreateSupplier } from '../validation/supplierInput.js';
import { parseUpdateSupplier } from '../validation/supplierUpdateInput.js';
import { idParamSchema, listQuerySchema, parseOrThrow } from '../validation/supplierQuery.js';

export interface AdminSupplierDependencies {
  reader: SupplierService;
  creation: SupplierCreationService;
  update: SupplierUpdateService;
  deletion: SupplierDeletionService;
  idempotency: IdempotencyStore;
}

export function createAdminSupplierController({ reader, creation, update: updater, deletion, idempotency }: AdminSupplierDependencies) {
  return {
    list: asyncHandler(async (req, res) => {
      const query = parseOrThrow(listQuerySchema, req.query, 'query');
      res.status(200).json(
        await reader.listAdminSuppliers({
          page: query.page,
          search: query.search === '' ? undefined : query.search,
          locationId: query.location_id,
          categoryId: query.category_id,
          isOpen: query.isOpen,
          sortOrder: query.sortOrder,
        }),
      );
    }),

    detail: asyncHandler(async (req, res) => {
      const { id } = parseOrThrow(idParamSchema, req.params, 'path');
      res.status(200).json(await reader.getAdminSupplier(id));
    }),

    create: asyncHandler(async (req, res) => {
      const userId = req.user?.user_id ?? '';
      const key = req.header('Idempotency-Key') ?? '';

      const state = await idempotency.begin(userId, key);
      if (state === 'in_flight') {
        throw new AppError(409, 'Conflict', 'A request with this Idempotency-Key is still being processed.');
      }
      if (state !== 'started') {
        res.status(state.statusCode).json(state.body); // replay of a completed request
        return;
      }

      try {
        const input = parseCreateSupplier((req.body ?? {}) as Record<string, unknown>);
        const files = ((req.files as Express.Multer.File[] | undefined) ?? []).map(
          (file): PhotoFile => ({ buffer: file.buffer, mimeType: file.mimetype as PhotoFile['mimeType'] }),
        );
        const result = await creation.createSupplier(input, files, { userId });
        await idempotency.complete(userId, key, result);
        res.status(result.statusCode).json(result.body);
      } catch (error) {
        await idempotency.abandon(userId, key);
        throw error;
      }
    }),

    update: asyncHandler(async (req, res) => {
      const { id } = parseOrThrow(idParamSchema, req.params, 'path');
      const input = parseUpdateSupplier((req.body ?? {}) as Record<string, unknown>);
      const files = ((req.files as Express.Multer.File[] | undefined) ?? []).map(
        (file): PhotoFile => ({ buffer: file.buffer, mimeType: file.mimetype as PhotoFile['mimeType'] }),
      );
      const result = await updater.updateSupplier(id, input, files);
      res.status(result.statusCode).json(result.body);
    }),

    remove: asyncHandler(async (req, res) => {
      const { id } = parseOrThrow(idParamSchema, req.params, 'path');
      const result = await deletion.deleteSupplier(id);
      res.status(result.statusCode).json(result.body);
    }),
  };
}
