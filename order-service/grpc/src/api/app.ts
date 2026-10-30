// AI Assistance Disclosure: ChatGPT (Codex), 2026-10-22.
// Scope: Generated setup implementation following approved User Service conventions.
// Author review: Pending; see ../../../usage-log.md.
import express, { type Express } from 'express';
import { pingDatabase, prisma } from '../db';
import { createOrderAcceptance } from '../services/orderAcceptance';
import { createOrderRouter } from './routes/orderRoutes';
import type { createOrderCreation } from '../services/orderCreation';
import type { createOrderEdits } from '../services/orderEdits';
import type { createOrderLifecycle } from '../services/orderLifecycle';

export function createApp(publicKey?: string, lifecycle?: ReturnType<typeof createOrderLifecycle>, creation?: ReturnType<typeof createOrderCreation>, edits?: ReturnType<typeof createOrderEdits>): Express {
  const app = express();
  app.use(express.json());
  app.get('/health', async (_req, res) => {
    const dbUp = await pingDatabase();
    res.status(dbUp ? 200 : 503).json({
      status: dbUp ? 'ok' : 'degraded',
      db: dbUp ? 'up' : 'down',
    });
  });
  app.use('/orders', createOrderRouter(publicKey, lifecycle, creation, edits, createOrderAcceptance(prisma)));
  app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    const badJson = error instanceof SyntaxError && 'status' in error && error.status === 400;
    res.status(badJson ? 400 : 500).json({ error: badJson ? 'invalid-input' : 'internal-error' });
  });
  return app;
}
