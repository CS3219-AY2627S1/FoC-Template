// AI Assistance Disclosure: ChatGPT (Codex), 2026-10-22.
// Scope: Implemented author-approved Order validation/authentication/RPC integration.
// Author review: Pending; see ../../../../usage-log.md.
import { z } from 'zod';

const nonblank = z.string().refine((value) => value.trim().length > 0, 'Must not be blank');
const supplierId = z.string().regex(/^[1-9][0-9]*$/).refine(
  (value) => BigInt(value) <= 9223372036854775807n, 'Supplier ID exceeds PostgreSQL bigint range',
);
export const createOrderSchema = z.object({
  supplierId,
  destination: nonblank,
  requestDetails: nonblank,
  credits: z.number().int().positive().max(2147483647),
  expiryTime: z.iso.datetime({ offset: true }).transform((value) => new Date(value)),
}).strict();

export const editOrderSchema = createOrderSchema.partial().refine(
  (value) => Object.keys(value).length > 0, 'Supply at least one field',
);

export const idempotencyKeySchema = z.string().refine(
  (value) => value.trim().length > 0 && !/[\x00-\x1f\x7f]/.test(value),
  'A nonblank Idempotency-Key without control characters is required',
);

// Call with database time when processing a creation/edit, including recovery.
export function isAllowedExpiry(expiryTime: Date, now: Date): boolean {
  return Number.isFinite(expiryTime.getTime()) && expiryTime.getTime() - now.getTime() >= 60 * 60 * 1000;
}
