/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: claude-sonnet-5-5), date: 2026-11-11
 * Scope: POST /suppliers/:supplierId/cancel-orders for supplier-service's worker, per the team
 *        decision in chat, 2026-11-11 (path id, JSON body { supplierName }, service-key auth,
 *        200 on success; open/accepted requests cancelled with a system chat message).
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review:
 */
import { Router } from 'express';
import type { PrismaClient } from '../db/prisma.js';
import type { OrderEventPublisher } from '../realtime/order-events.js';
import { requireSupplierServiceKey } from '../middleware/service-key.js';
import { cancelOrdersForSupplier } from '../services/orders.service.js';
import { isNonEmptyString, isPositiveInt } from '../utils/validation.js';

export function suppliersRouter(
  prisma: PrismaClient,
  {
    serviceKey,
    events,
  }: { serviceKey: string | undefined; events?: OrderEventPublisher },
): Router {
  const router = Router();
  router.post(
    '/:supplierId/cancel-orders',
    requireSupplierServiceKey(serviceKey),
    async (req, res, next) => {
      try {
        const supplierId = Number(req.params.supplierId);
        if (!isPositiveInt(supplierId)) {
          res.status(400).json({ message: 'Invalid supplier id.' });
          return;
        }
        const supplierName = (
          req.body as { supplierName?: unknown } | undefined
        )?.supplierName;
        if (!isNonEmptyString(supplierName) || supplierName.length > 200) {
          res.status(400).json({ message: 'supplierName is required.' });
          return;
        }
        const result = await cancelOrdersForSupplier(
          prisma,
          supplierId,
          supplierName.trim(),
          new Date(),
          events,
        );
        res.status(200).json(result);
      } catch (error) {
        next(error);
      }
    },
  );
  return router;
}
