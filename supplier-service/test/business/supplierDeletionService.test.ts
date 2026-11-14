/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: claude-sonnet-5-5), date: 2026-09-30
 * Scope: Tests for the supplier deletion service (Phase 4 plan Task 5). No requirements,
 *        architecture, schema, or API decisions were made by the AI tool.
 * Author review:
 */
import { describe, expect, it, vi } from 'vitest';
import { createSupplierDeletionService } from '../../src/business/supplierDeletionService.js';

function build(softDelete = vi.fn().mockResolvedValue(true)) {
  const service = createSupplierDeletionService({
    repo: { softDelete },
    clock: () => new Date('2026-09-30T02:00:00Z'),
  });
  return { service, softDelete };
}

describe('deleteSupplier', () => {
  it('soft-deletes with the Singapore time, hands the suspension task to the same transaction, and answers 200 with id', async () => {
    const { service, softDelete } = build();

    const result = await service.deleteSupplier(101);

    expect(softDelete).toHaveBeenCalledWith(101, '2026-09-30 10:00:00', [
      { taskName: 'supplier_suspension', payload: { supplier_id: 101 } },
    ]);
    expect(result).toEqual({ statusCode: 200, body: { id: 101, isDeleted: true } });
  });

  it('answers 404 when no live row matched (repeat DELETE, unknown id)', async () => {
    const { service } = build(vi.fn().mockResolvedValue(false));
    await expect(service.deleteSupplier(9)).rejects.toMatchObject({ statusCode: 404 });
  });

  it('lets a database failure propagate', async () => {
    const { service } = build(vi.fn().mockRejectedValue(new Error('db down')));
    await expect(service.deleteSupplier(101)).rejects.toThrow('db down');
  });
});
