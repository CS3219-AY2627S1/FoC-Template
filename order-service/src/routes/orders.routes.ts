/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: claude-opus-5-5), date: 2026-10-20
 * Scope (2026-10-20): Issue #4 - credit client removed from the router deps (credit calls moved to
 *        the worker).
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review: george-yeo
 * Scope (2026-10-20): Issue #5 - POST /orders/:id/accept, following the existing
 *        POST /orders/:id/<action> transition routes.
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review: george-yeo
 * Scope (2026-10-20): Issue #6 - GET /orders/active (F12.1.3, path by convention under
 *        /orders); writes receive the order-event publisher. Authentication is applied to
 *        all of /orders by Wen Xi's middleware in app.ts. Frontend integration -
 *        GET /orders/mine.
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review: george-yeo
 * Tool: Claude Code (model: claude-opus-5-5), date: 2026-10-22
 * Scope (2026-10-22): router.param('id') guard - a non-UUID :id answers 404
 *        ORDER_NOT_FOUND before reaching Prisma's @db.Uuid column (George).
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review: George Yeo
 * Scope (2026-10-22): GET /orders/:id (George's spec), registered after the literal
 *        /active and /mine paths so they are not captured as ids.
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review: George Yeo
 * Tool: Codex (model: GPT-6), date: 2026-11-05
 * Scope: Implemented the team-specified admin user order listing contract from chat.
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review: tng wen xi
 * Tool: Claude Code (model: claude-opus-5-5), date: 2026-10-23
 * Scope (2026-10-23): the router takes the supplier-service client for create / edit.
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review: George Yeo
 * Tool: Claude Code (model: claude-opus-5-5), date: 2026-11-07
 * Scope (2026-11-07): applied the 2026-10-23 change onto main, keeping both suppliers and userServiceUrl.
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review: George Yeo
 * Scope (2026-11-08, Codex, model: GPT-6): Implemented team-specified status notifications and username fallback.
 * Author review: tng wen xi
 * Tool: Claude Code (model: claude-opus-5-5), date: 2026-11-09
 * Scope (2026-11-09): POST /orders gets the credits client and event sink for the synchronous
 *        reserve (George, 2026-11-09).
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review: George Yeo
 * Tool: Claude Code (model: claude-sonnet-5), date: 2026-11-09
 * Scope: Stage 28 e (instructions.md) - mounted seriesRouter at /series, before GET /:id, per
 *        the stage's API table ("registered BEFORE /:id"). No requirements, architecture,
 *        schema, or API decisions were made by the AI tool.
 * Author review:
 */

import { Router } from 'express';
import type { RequestStatus } from '../generated/prisma/client.js';
import type { OrderEventPublisher } from '../realtime/order-events.js';
import type { PrismaClient } from '../db/prisma.js';
import type { SuppliersClient } from '../clients/suppliers.client.js';
import type { CreditsClient } from '../clients/credits.client.js';
import * as ordersController from '../controllers/orders.controller.js';
import { ErrorCode, ErrorMessage } from '../constants/errors.js';
import { isUuid } from '../utils/validation.js';
import { seriesRouter } from './series.routes.js';

export interface OrdersRouterDeps {
  /** supplier-service, for the create / edit existence check. */
  suppliers: SuppliersClient;
  /** credit-service, for the reserve made while creating an order. */
  credits: CreditsClient;
  events?: OrderEventPublisher;
  userServiceUrl?: string;
}

export function ordersRouter(
  prisma: PrismaClient,
  {
    suppliers,
    credits,
    events,
    userServiceUrl = 'http://localhost:3001',
  }: OrdersRouterDeps,
): Router {
  const router = Router();
  router.param('id', (_req, res, next, id) => {
    if (isUuid(id)) return next();
    res.status(404).json({ message: ErrorMessage[ErrorCode.ORDER_NOT_FOUND] });
  });
  const transition = (status: RequestStatus) =>
    ordersController.transitionOrder(prisma, status, events, userServiceUrl);

  router.get('/', ordersController.getOrders(prisma));
  router.get('/active', ordersController.getActiveDeliveries(prisma));
  router.get('/mine', ordersController.getMyOrders(prisma));
  // AI-generated
  router.get(
    '/admin/users/:userId',
    ordersController.getAdminUserOrders(prisma, userServiceUrl),
  );
  // Stage 28 e: registered before /:id so "series" is never captured as an order id.
  router.use('/series', seriesRouter(prisma));
  router.get('/:id', ordersController.getOrderById(prisma));
  router.post(
    '/',
    ordersController.createOrder(prisma, suppliers, credits, events),
  );
  router.post('/:id/accept', transition('accepted'));
  router.post('/:id/pickup', transition('picked_up'));
  router.post('/:id/deliver', transition('delivered'));
  router.post('/:id/complete', transition('completed'));
  router.post('/:id/cancel', transition('cancelled'));
  router.patch(
    '/:id/edit',
    ordersController.editOrder(prisma, suppliers, events),
  );
  return router;
}
