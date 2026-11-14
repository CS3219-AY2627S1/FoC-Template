/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: claude-opus-5-5), date: 2026-10-22
 * Scope (2026-10-22): Observability - bull-board served by the order worker on its own
 *        port, showing every queue on order-redis (George, 2026-10-22: worker, own port,
 *        all queues). Read-only so the board cannot retry or delete jobs behind the
 *        dead-letter table's back. Base path /admin/queues is by convention.
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review: George Yeo
 */

import type { Server } from 'node:http';
import { createBullBoard } from '@bull-board/api';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { ExpressAdapter } from '@bull-board/express';
import { Queue, type ConnectionOptions } from 'bullmq';
import express, { type Express } from 'express';

export const QUEUE_DASHBOARD_PATH = '/admin/queues';

/** A queue to show: its BullMQ name and key prefix (BullMQ's default is `bull`). */
export interface DashboardQueue {
  name: string;
  prefix?: string;
}

export function createQueueDashboardApp(queues: Queue[]): Express {
  const serverAdapter = new ExpressAdapter();
  serverAdapter.setBasePath(QUEUE_DASHBOARD_PATH);
  createBullBoard({
    queues: queues.map((q) => new BullMQAdapter(q, { readOnlyMode: true })),
    serverAdapter,
  });
  const app = express();
  app.disable('x-powered-by');
  app.use(QUEUE_DASHBOARD_PATH, serverAdapter.getRouter());
  return app;
}

export interface QueueDashboard {
  close(): Promise<void>;
}

/** Opens its own read-only Queue handles so closing the board never closes the workers'. */
export async function startQueueDashboard(
  connection: ConnectionOptions,
  port: number,
  queues: DashboardQueue[],
): Promise<QueueDashboard> {
  const handles = queues.map(
    ({ name, prefix }) =>
      new Queue(name, { connection, ...(prefix && { prefix }) }),
  );
  const app = createQueueDashboardApp(handles);
  const server = await new Promise<Server>((resolve, reject) => {
    const s = app.listen(port, (error?: Error) =>
      error ? reject(error) : resolve(s),
    );
  });
  console.log(
    `Queue dashboard on http://localhost:${port}${QUEUE_DASHBOARD_PATH}`,
  );
  return {
    async close() {
      await new Promise<void>((resolve) => server.close(() => resolve()));
      await Promise.all(handles.map((q) => q.close()));
    },
  };
}
