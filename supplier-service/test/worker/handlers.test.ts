/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: claude-sonnet-5-5), date: 2026-09-30
 * Scope: Tests for the image_cleanup and supplier_suspension handlers (Phase 4 plan Task 10). No
 *        requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review:
 * Scope (2026-09-30, Claude Code, model: claude-sonnet-5-5): added two idempotency tests (Phase 4 plan
 *        Task 15): repeating a cleanup job, and re-running a suspension job after a partial failure.
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review:
 * Scope (2026-09-30, Claude Code, model: claude-sonnet-5-5): added payload-constraint tests for both handlers; renamed the repeated-delivery cleanup test.
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review:
 * Scope (2026-11-11, Claude Code, model: claude-sonnet-5-5): reactivation-skip tests for the suspension handler; fakes gain a supplier status reader.
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review:
 * Scope (2026-11-11, Claude Code, model: claude-sonnet-5-5): suspension tests rewritten for the HTTP Order client (supplier name passed, no Message client), the reactivation skip and the missing-supplier bad job.
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review:
 */
import { UnrecoverableError } from 'bullmq';
import { describe, expect, it, vi } from 'vitest';
import { createPhotoCleanupHandler, createSuspensionHandler } from '../../src/worker/handlers.js';

describe('photo cleanup handler', () => {
  it('deletes the cloud object at photo_location', async () => {
    const del = vi.fn().mockResolvedValue(undefined);
    await createPhotoCleanupHandler({ delete: del })({ photo_id: 7, photo_location: 'loc-7' });
    expect(del).toHaveBeenCalledWith('loc-7');
  });

  it('treats an invalid payload as a bad job (unrecoverable) and deletes nothing', async () => {
    const del = vi.fn();
    const error = await createPhotoCleanupHandler({ delete: del })({ photo_id: 7 }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(UnrecoverableError);
    expect(del).not.toHaveBeenCalled();
  });

  it('lets a storage failure propagate as an ordinary, retryable error', async () => {
    const del = vi.fn().mockRejectedValue(new Error('s3 down'));
    const error = await createPhotoCleanupHandler({ delete: del })({ photo_id: 7, photo_location: 'x' }).catch(
      (e: unknown) => e,
    );
    expect(error).toMatchObject({ message: 's3 down' });
    expect(error).not.toBeInstanceOf(UnrecoverableError);
  });

  it('does not fail when the same job is delivered twice', async () => {
    const del = vi.fn().mockResolvedValue(undefined);
    const handler = createPhotoCleanupHandler({ delete: del });
    await handler({ photo_id: 7, photo_location: 'loc-7' });
    await expect(handler({ photo_id: 7, photo_location: 'loc-7' })).resolves.toBeUndefined();
    expect(del).toHaveBeenCalledTimes(2);
  });
});

describe('payload constraints that only the schemas enforce', () => {
  it.each([
    { photo_id: 1, photo_location: '' },
    { photo_id: 1.5, photo_location: 'x' },
  ])('photo cleanup handler rejects %j as a bad job', async (payload) => {
    const del = vi.fn();
    const error = await createPhotoCleanupHandler({ delete: del })(payload).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(UnrecoverableError);
    expect(del).not.toHaveBeenCalled();
  });

});

const deleted = { name: 'Campus Store', isDeleted: true, isActive: true };
const statusOf = (status: { name: string; isDeleted: boolean; isActive: boolean } | null) => ({
  getStatus: vi.fn().mockResolvedValue(status),
});

describe('suspension handler', () => {
  it.each([{ supplier_id: 0 }, { supplier_id: -1 }, { supplier_id: 1.5 }, { supplier_id: 'x' }])(
    'rejects %j as a bad job',
    async (payload) => {
      const order = { deleteUncollectedRequests: vi.fn() };
      const error = await createSuspensionHandler({ order, suppliers: statusOf(deleted) })(payload).catch(
        (e: unknown) => e,
      );
      expect(error).toBeInstanceOf(UnrecoverableError);
      expect(order.deleteUncollectedRequests).not.toHaveBeenCalled();
    },
  );

  it.each([
    ['soft-deleted', deleted],
    ['inactive but not deleted', { name: 'Campus Store', isDeleted: false, isActive: false }],
  ])('cancels uncollected orders, passing the supplier name, when the supplier is %s', async (_label, status) => {
    const order = { deleteUncollectedRequests: vi.fn().mockResolvedValue(undefined) };
    await createSuspensionHandler({ order, suppliers: statusOf(status) })({ supplier_id: 101 });
    expect(order.deleteUncollectedRequests).toHaveBeenCalledWith(101, 'Campus Store');
  });

  it('skips the job when the supplier was reactivated (not deleted, active)', async () => {
    const order = { deleteUncollectedRequests: vi.fn() };
    await createSuspensionHandler({
      order,
      suppliers: statusOf({ name: 'Campus Store', isDeleted: false, isActive: true }),
    })({ supplier_id: 101 });
    expect(order.deleteUncollectedRequests).not.toHaveBeenCalled();
  });

  it('treats a missing supplier row as a bad job', async () => {
    const order = { deleteUncollectedRequests: vi.fn() };
    const error = await createSuspensionHandler({ order, suppliers: statusOf(null) })({ supplier_id: 101 }).catch(
      (e: unknown) => e,
    );
    expect(error).toBeInstanceOf(UnrecoverableError);
    expect(order.deleteUncollectedRequests).not.toHaveBeenCalled();
  });

  it('fails the attempt when order-service fails, and can be re-run', async () => {
    const order = {
      deleteUncollectedRequests: vi.fn().mockRejectedValueOnce(new Error('order down')).mockResolvedValue(undefined),
    };
    const handler = createSuspensionHandler({ order, suppliers: statusOf(deleted) });
    await expect(handler({ supplier_id: 101 })).rejects.toThrow('order down');
    await expect(handler({ supplier_id: 101 })).resolves.toBeUndefined();
    expect(order.deleteUncollectedRequests).toHaveBeenCalledTimes(2);
  });
});
