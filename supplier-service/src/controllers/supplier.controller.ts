/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: claude-sonnet-5), date: 2026-09-29
 * Scope: HTTP controller for the Phase 1 read endpoints (SupplierServiceArchitecture.md §3, §7):
 *        validates the request, calls the business service, returns 200 with its result. No
 *        requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review:
 * Scope (2026-11-05, Claude Code, model: claude-sonnet-5-5): Pass the ids query value to the list service, per the 2026-11-05 supplier-bookmarking spec.
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review:
 */
import type { SupplierService } from '../business/supplierService.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { idParamSchema, listQuerySchema, parseOrThrow } from '../validation/supplierQuery.js';

export function createSupplierController(service: SupplierService) {
  return {
    list: asyncHandler(async (req, res) => {
      const query = parseOrThrow(listQuerySchema, req.query, 'query');
      const result = await service.listSuppliers({
        page: query.page,
        search: query.search === '' ? undefined : query.search,
        locationId: query.location_id,
        categoryId: query.category_id,
        isOpen: query.isOpen,
        sortOrder: query.sortOrder,
        ids: query.ids,
      });
      res.status(200).json(result);
    }),

    detail: asyncHandler(async (req, res) => {
      const { id } = parseOrThrow(idParamSchema, req.params, 'path');
      res.status(200).json(await service.getSupplier(id));
    }),

    locations: asyncHandler(async (_req, res) => {
      res.status(200).json(await service.listLocations());
    }),

    categories: asyncHandler(async (_req, res) => {
      res.status(200).json(await service.listCategories());
    }),
  };
}
