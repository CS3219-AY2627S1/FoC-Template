/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: claude-sonnet-5-5), date: 2026-09-30
 * Scope: Handlers for the image_cleanup and supplier_suspension job types (Phase 4 plan Task 10);
 *        SupplierServiceArchitecture.md §8.1, §8.2. Payload shapes are the recorded/team-supplied ones;
 *        an invalid payload is a bad job (team answer 2026-09-30). No requirements, architecture,
 *        schema, or API decisions were made by the AI tool.
 * Author review:
 * Scope (2026-11-11, Claude Code, model: claude-sonnet-5-5): the suspension handler skips the job when the supplier is live again (is_deleted false and is_active true) (team decision in chat).
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review:
 * Scope (2026-11-11, Claude Code, model: claude-sonnet-5-5): the suspension handler passes the supplier name to the real Order client; the Message client is removed because order-service now sends the chat notice (team contract in chat).
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review:
 */
import { UnrecoverableError } from 'bullmq';
import { z } from 'zod';
import type { PhotoStorage } from '../storage/photoStorage.js';
import type { OrderClient } from './downstream.js';

/** Resolves on success; a rejection is a failed attempt, an UnrecoverableError a bad job (no retries). */
export type JobHandler = (payload: unknown) => Promise<void>;

const photoCleanupPayload = z.object({ photo_id: z.number().int(), photo_location: z.string().min(1) });
const suspensionPayload = z.object({ supplier_id: z.number().int().positive() });

function parsePayload<T>(schema: z.ZodType<T>, payload: unknown): T {
  const result = schema.safeParse(payload);
  if (!result.success) {
    const issues = result.error.issues.map((issue) => `${issue.path.join('.') || 'payload'}: ${issue.message}`);
    throw new UnrecoverableError(`Invalid job payload: ${issues.join('; ')}`);
  }
  return result.data;
}

export function createPhotoCleanupHandler(storage: Pick<PhotoStorage, 'delete'>): JobHandler {
  return async (payload) => {
    const { photo_location } = parsePayload(photoCleanupPayload, payload);
    await storage.delete(photo_location);
  };
}

/** Reads the supplier's current flags; null when the row does not exist. */
export interface SupplierStatusReader {
  getStatus(supplierId: number): Promise<{ name: string; isDeleted: boolean; isActive: boolean } | null>;
}

export function createSuspensionHandler({
  order,
  suppliers,
}: {
  order: OrderClient;
  suppliers: SupplierStatusReader;
}): JobHandler {
  return async (payload) => {
    const { supplier_id } = parsePayload(suspensionPayload, payload);
    // The supplier may have been reactivated since the job was queued: then nothing is cancelled.
    const status = await suppliers.getStatus(supplier_id);
    if (status === null) throw new UnrecoverableError(`Supplier ${supplier_id} does not exist.`);
    if (!status.isDeleted && status.isActive) return;
    // order-service cancels the uncollected requests and posts the chat notice; the job is retried as a unit.
    await order.deleteUncollectedRequests(supplier_id, status.name);
  };
}
