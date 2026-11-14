// AI Assistance Disclosure:
// Tool: Claude Code (model: claude-opus-5), date: 2026-09-26
//  2026-09-26: Recess iteration - Express app wiring. Exported without listening so the
//    tests can mount it, matching user-service (app.ts does not start the server).
//    No requirements, architecture, schema, or API decisions were made by the AI tool.
//    Author review: Wee Jean

import express from 'express';
import creditsRouter from './routes/credits.routes.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';

const app = express();

app.use(express.json());

// Matches the healthcheck the root compose.yaml already uses for order-service.
app.get('/health', (_req, res) => {
  res.status(200).json({ status: 'ok' });
});

app.use('/credits', creditsRouter);

app.use(notFoundHandler);
app.use(errorHandler);

export default app;
