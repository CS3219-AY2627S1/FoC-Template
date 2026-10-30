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
