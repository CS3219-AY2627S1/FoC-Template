// AI Assistance Disclosure:
// Tool: OpenAI Codex (model: GPT-6), dates: 2026-10-20–2026-10-22 (Asia/Singapore).
// Scope: Connected the human-specified credit service to authenticated gRPC/REST and transport/database lifecycle. Implemented/documented the human-decided plaintext-only Credit gRPC transport; service-token and REST JWT authentication retained. Wired nonfatal user-event consumer startup and broker cleanup using the human's helpers. Added/tested/documented startup-only listener health with database-based HTTP status as the human specified. Connected REST health to a PostgreSQL SELECT 1 probe.
// Refactor: Moved/imports updated for the human-specified src layout (entry 024).
// Author review: 
// Prompts and key responses: ../ai/usage-log.md, entries 005–024, 031, 035, 036, 038.

import { startServer, stopServer } from '@foc/grpc';
import { readFile } from 'node:fs/promises';
import { Pool } from 'pg';
import { ServerCredentials } from '@grpc/grpc-js';
import { env } from './env';
import { createGrpcServer } from './grpc/server';
import { CreditService } from './services/CreditService';
import { createRestServer } from './rest/server';

async function main(): Promise<void> {
  const publicKeyPem = await readFile(env.CREDIT_JWT_PUBLIC_KEY_PATH, 'utf8');
  const pool = new Pool({ connectionTimeoutMillis: 5000 });
  pool.on('error', () => console.error('Credit database idle connection error'));
  const service = new CreditService(pool);
  const server = createGrpcServer(service, { 'order-service': env.CREDIT_ORDER_SERVICE_TOKEN });
  let listenerStarted = false;
  const rest = createRestServer(service, publicKeyPem, async () => {
    try {
      await pool.query('SELECT 1');
      return true;
    } catch {
      return false;
    }
  }, () => listenerStarted);
  let port: number;
  try {
    port = await startServer(server, env.GRPC_PORT, env.GRPC_HOST, ServerCredentials.createInsecure());
    await new Promise<void>((resolve, reject) => {
      rest.once('error', reject);
      rest.listen(env.HTTP_PORT, env.HTTP_HOST, () => { rest.off('error', reject); resolve(); });
    });
  } catch (error) {
    server.forceShutdown();
    await pool.end();
    throw error;
  }
  console.log('credit-service gRPC listening on ' + env.GRPC_HOST + ':' + port);
  console.log('credit-service REST listening on ' + env.HTTP_HOST + ':' + env.HTTP_PORT);

  let shuttingDown = false;
  let broker: Awaited<ReturnType<typeof import('./events/broker').startUserEventConsumer>> | undefined;
  let consumerStartup: Promise<void>;
  const shutdown = async (): Promise<void> => {
    if (shuttingDown) return;
    shuttingDown = true;
    listenerStarted = false;
    const results = await Promise.allSettled([
      stopServer(server),
      new Promise<void>((resolve) => { rest.close(() => resolve()); }),
      (async () => { await consumerStartup; await broker?.close(); })(),
    ]);
    for (const result of results) {
      if (result.status === 'rejected') console.error('Credit transport shutdown failed', result.reason);
    }
    await pool.end();
  };
  const onSignal = () => void shutdown().catch((error: unknown) => {
    console.error('Credit shutdown failed', error);
    process.exitCode = 1;
  });
  process.on('SIGINT', onSignal);
  process.on('SIGTERM', onSignal);

  consumerStartup = (async () => {
    try {
      // Package loading is part of the nonfatal consumer startup attempt.
      const { startUserEventConsumer } = require('./events/broker') as typeof import('./events/broker');
      broker = await startUserEventConsumer(service, env.RABBITMQ_URL);
      listenerStarted = !shuttingDown;
    } catch (error) {
      console.error('Credit user-event consumer unavailable; APIs remain running', error);
    }
  })();
}

main().catch((error: unknown) => {
  console.error('Fatal error during startup:', error);
  process.exit(1);
});
