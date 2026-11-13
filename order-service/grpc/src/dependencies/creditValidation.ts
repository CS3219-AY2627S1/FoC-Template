// AI Assistance Disclosure: ChatGPT (Codex), 2026-10-22.
// Scope: Retained Order response validation/error classification when adopting shared Credit client.
// Author review: Pending; see ../../../usage-log.md.
import { status, type ServiceError } from '@grpc/grpc-js';
import { z } from 'zod';

const reservationSchema = z.object({
  orderId: z.uuid(), requesterId: z.string().min(1), amount: z.number().int().positive(),
  status: z.enum(['RESERVED', 'RELEASED', 'SETTLED']),
  reservationId: z.string().min(1), version: z.number().int().positive(), courierId: z.string().optional(),
});
const balanceSchema = z.object({
  userId: z.string().min(1), availableCredits: z.number().int().nonnegative(),
  reservedCredits: z.number().int().nonnegative(), totalCredits: z.number().int().nonnegative(),
});
// Transport, protobufs, deadlines and RPC retries belong to @foc/grpc.
export const validateReservation = (value: unknown) => reservationSchema.parse(value);
export const validateBalance = (value: unknown) => balanceSchema.parse(value);

export function classifyCreditError(error: unknown): 'rejected' | 'unavailable' | 'uncertain' {
  const failure = error as Partial<ServiceError> | null;
  const code = failure?.code;
  // User registration events can arrive after an Order operation. Retry only
  // the explicitly identified account gap within the existing durable budget.
  if (code === status.NOT_FOUND && failure?.metadata?.get('x-credit-error-reason').includes('ACCOUNT_NOT_FOUND')) return 'unavailable';
  if (code === status.INVALID_ARGUMENT || code === status.FAILED_PRECONDITION || code === status.NOT_FOUND) return 'rejected';
  if (code === status.UNAUTHENTICATED || code === status.PERMISSION_DENIED || code === status.UNIMPLEMENTED) return 'unavailable';
  return 'uncertain';
}
