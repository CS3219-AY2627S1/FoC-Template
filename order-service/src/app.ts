/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: claude-opus-5-5), date: 2026-09-23
 * Scope: Project scaffolding / infrastructure only. No requirements,
 *        architecture, schema, or API decisions were made by the AI tool.
 * Author review: george-yeo
 * Tool: Claude Code (model: claude-opus-5-5), date: 2026-10-20
 * Scope (2026-10-20): Issue #4 - dropped the credit client from AppDeps; the API no longer calls
 *        credit-service.
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review: george-yeo
 * Scope (2026-10-20): Issue #6 - createApp takes the order-event publisher; REST auth is
 *        Wen Xi's authenticate middleware (George, 2026-10-20: keep hers).
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review: george-yeo
 * Tool: Codex (model: GPT-6), date: 2026-11-05
 * Scope: Implemented the team-specified admin user order listing contract from chat.
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review: tng wen xi
 * Tool: Claude Code (model: claude-opus-5-5), date: 2026-10-23
 * Scope (2026-10-23): AppDeps takes the supplier-service client (or its URL, default
 *        http://localhost:3004, supplier-service's published port) for the orders router.
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review: George Yeo
 * Tool: Claude Code (model: claude-opus-5-5), date: 2026-11-07
 * Scope (2026-11-07): applied the 2026-10-23 change onto main, keeping both suppliers and userServiceUrl.
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review: George Yeo
 * Tool: Claude Code (model: claude-opus-5-5), date: 2026-11-09
 * Scope (2026-11-09): AppDeps takes a credits client (HTTP to CREDIT_SERVICE_URL by default) for the
 *        synchronous reserve on POST /orders (George, 2026-11-09).
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review: George Yeo
 * Tool: Claude Code (model: claude-sonnet-5-5), date: 2026-11-11
 * Scope: mounts /suppliers (service-key protected, outside the user-JWT /orders middleware) (team decision in chat, 2026-11-11).
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review:
 */

import express, { type Express } from 'express';
import type { PrismaClient } from './db/prisma.js';
import type { RequestHandler } from 'express';
import { createAuthenticate } from './middleware/authenticate.js';
import { errorHandler, notFound } from './middleware/error-handler.js';
import { healthRouter } from './routes/health.routes.js';
import { ordersRouter } from './routes/orders.routes.js';
import { suppliersRouter } from './routes/suppliers.routes.js';
import type { OrderEventPublisher } from './realtime/order-events.js';
import {
  createHttpSuppliersClient,
  type SuppliersClient,
} from './clients/suppliers.client.js';
import {
  createHttpCreditsClient,
  type CreditsClient,
} from './clients/credits.client.js';

export interface AppDeps {
  prisma: PrismaClient;
  authenticate?: RequestHandler;
  userServiceUrl?: string;
  /** Where writes publish order events (the Socket.IO sink in production). */
  events?: OrderEventPublisher;
  /** supplier-service for the create / edit existence check; defaults to HTTP. */
  suppliers?: SuppliersClient;
  supplierServiceUrl?: string;
  /** credit-service for the reserve made while creating an order; defaults to HTTP. */
  credits?: CreditsClient;
  creditServiceUrl?: string;
  /** Key supplier-service's worker must send to POST /suppliers/:id/cancel-orders. */
  supplierServiceKey?: string;
}

/**
 * Builds the Express app without listening, so tests can drive it with
 * supertest and inject fake dependencies.
 */
export function createApp({
  prisma,
  authenticate,
  userServiceUrl = 'http://localhost:3001',
  events,
  supplierServiceUrl = 'http://localhost:3004',
  suppliers = createHttpSuppliersClient(supplierServiceUrl),
  creditServiceUrl = 'http://localhost:3003',
  credits = createHttpCreditsClient(creditServiceUrl),
  supplierServiceKey,
}: AppDeps): Express {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json());

  app.use('/health', healthRouter(prisma));
  app.use(
    '/orders',
    authenticate ?? createAuthenticate(userServiceUrl),
    ordersRouter(prisma, { suppliers, credits, events, userServiceUrl }),
  );

  app.use(
    '/suppliers',
    suppliersRouter(prisma, { serviceKey: supplierServiceKey, events }),
  );

  app.use(notFound);
  app.use(errorHandler);
  return app;
}
