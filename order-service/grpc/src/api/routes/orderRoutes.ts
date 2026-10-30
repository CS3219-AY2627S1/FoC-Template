// AI Assistance Disclosure: ChatGPT (Codex), 2026-10-23.
// Scope: Added approved pickup route to order commands and scoped retrieval.
// Author review: Pending; see ../../../../usage-log.md.
import { Router, type RequestHandler } from 'express';
import type { createOrderLifecycle } from '../../services/orderLifecycle';
import { createAuthenticate, requireUser } from '../../auth/authenticate';
import type { createOrderCreation } from '../../services/orderCreation';
import type { createOrderEdits } from '../../services/orderEdits';
import type { createOrderAcceptance } from '../../services/orderAcceptance';
import { pickupOrder, deliverOrder, acceptOrder, cancelOrder, createOrder, editOrder, getAllOrders } from '../controllers/orderController';

export function createOrderRouter(publicKey?: string, lifecycle?: ReturnType<typeof createOrderLifecycle>, creation?: ReturnType<typeof createOrderCreation>, edits?: ReturnType<typeof createOrderEdits>, acceptance?: ReturnType<typeof createOrderAcceptance>) {
  const router = Router();
  const unavailable: RequestHandler = (_req, res) => { res.status(503).json({ error: 'dependency-unavailable' }); };
  router.use(publicKey ? createAuthenticate(publicKey) : unavailable);
  router.get('/', getAllOrders);
  router.use(requireUser);
  router.post('/', createOrder(creation));
  router.patch('/:id', editOrder(edits));
  router.post('/:id/accept', acceptOrder(acceptance));
  router.post('/:id/cancel', cancelOrder(lifecycle));
  router.post('/:id/pickup', pickupOrder(lifecycle));
  router.post('/:id/deliver', deliverOrder(lifecycle));
  return router;
}
