// AI Assistance Disclosure:
// Tool: Claude Code (Claude Opus), dates: 2026-09-25 – 2026-10-11
// Scope: AI generated the Express app with /health, mounted the user routes
// and added cookie-parser.
// Author review: Author approved the health endpoint, reviewed the code and
// approved. See user-service/ai/usage-log.md, entries 001, 004, 010.

import express, { type Express } from 'express';
import cookieParser from 'cookie-parser';
import { pingDatabase } from '../db';
import { userRouter } from './routes/userRoutes';

export function createApp(): Express {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());

  app.get('/health', async (_req, res) => {
    const dbUp = await pingDatabase();
    res.status(dbUp ? 200 : 503).json({
      status: dbUp ? 'ok' : 'degraded',
      db: dbUp ? 'up' : 'down',
    });
  });

  // Feature routes
  app.use('/users', userRouter);

  return app;
}
