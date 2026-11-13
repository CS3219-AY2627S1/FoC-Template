// AI Assistance Disclosure: ChatGPT (Codex), 2026-11-02.
// Scope: Human-approved deletion eligibility contract; review pending; see ../../../usage-log.md.
import { OrderService, createServer, unimplemented, type OrderServiceHandlers } from '@foc/grpc';
import { status } from '@grpc/grpc-js';
import type { PrismaClient } from '../generated/prisma';
import { findDeletionBlockingOrders } from '../services/deletionEligibility';

export function createGrpcServer(db?: PrismaClient) {
  const handlers: OrderServiceHandlers = {
    GetOrder: unimplemented('GetOrder'),
    CheckDeletionEligibility: async (call, callback) => {
      const userId = call.request.userId;
      if (!userId?.trim()) {
        callback({ code: status.INVALID_ARGUMENT, details: 'user_id is required' });
        return;
      }
      if (!db) {
        callback({ code: status.UNAVAILABLE, details: 'Order database is unavailable' });
        return;
      }
      try {
        const orders = await findDeletionBlockingOrders(db, userId);
        callback(null, { eligible: orders.length === 0, blockedOrderCount: orders.length });
      } catch {
        // Never return eligible=true when the lookup failed.
        callback({ code: status.UNAVAILABLE, details: 'Unable to verify deletion eligibility' });
      }
    },
  };
  return createServer(OrderService.service, handlers);
}
