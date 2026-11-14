/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: claude-opus-5-5), date: 2026-09-23
 * Scope: Project scaffolding / infrastructure only. No requirements,
 *        architecture, schema, or API decisions were made by the AI tool.
 * Author review: george-yeo
 * Tool: Claude Code (model: claude-opus-5-5), date: 2026-10-20
 * Scope (2026-10-20): Issue #4 - removed the stub credit client; reservation runs in the worker.
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review: george-yeo
 * Scope (2026-10-20): Issue #6 - one HTTP server for Express and Socket.IO; the
 *        Socket.IO Redis adapter over the shared order-redis for cross-replica emits
 *        (George, 2026-10-19); REST verifies JWTs against user-service's JWKS; events from
 *        the worker arrive over Redis pub/sub and are emitted locally.
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review: george-yeo
 * Tool: Claude Code (model: claude-opus-5-5), date: 2026-11-06
 * Scope (2026-11-06): ECS Fargate migration - Redis TLS through redisConnectionOptions,
 *        per George's ECS Fargate plan, Phase 1 item 5.
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review: George Yeo
 * Scope (2026-11-06): ECS Fargate migration - longer HTTP keep-alive, per George's ECS
 *        Fargate plan, Phase 1 item 8.
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review: George Yeo
 * Tool: Claude Code (model: claude-opus-5-5), date: 2026-10-23
 * Scope (2026-10-23): passes SUPPLIER_SERVICE_URL to the app.
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review: George Yeo
 * Tool: Claude Code (model: claude-opus-5-5), date: 2026-11-09
 * Scope (2026-11-09): Passes CREDIT_SERVICE_URL to the app for the synchronous reserve (George,
 *        2026-11-09).
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review: George Yeo
 * Tool: Claude Code (model: claude-sonnet-5-5), date: 2026-11-11
 * Scope: passes ORDER_SUPPLIER_SERVICE_API_KEY to the app (team decision in chat, 2026-11-11).
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review:
 */

import { createServer } from 'node:http';
import { createAdapter } from '@socket.io/redis-adapter';
import { config as loadDotenv } from 'dotenv';
import { Redis } from 'ioredis';
import { createApp } from './app.js';
import { createTokenVerifier } from './middleware/authenticate.js';
import { loadEnv, redisConnectionOptions, type Env } from './config/env.js';
import { createPrismaClient } from './db/prisma.js';
import { createSocketServer } from './realtime/socket-server.js';
import { createSocketSink, relayWorkerEvents } from './realtime/socket-sink.js';

// Local runs read order-service/.env; in Docker, compose injects the env.
loadDotenv({ quiet: true });

let env: Env;
try {
  env = loadEnv();
} catch (err) {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
}
const prisma = createPrismaClient(env.DATABASE_URL);
// Socket.IO handshakes use the same JWKS check as the REST middleware.
const verifyToken = createTokenVerifier(env.USER_SERVICE_URL);

// Redis connections: adapter pub + sub, and one subscriber for the worker's events.
const redisOptions = redisConnectionOptions(env);
const adapterPub = new Redis(redisOptions);
const adapterSub = adapterPub.duplicate();
const workerEvents = new Redis(redisOptions);

const httpServer = createServer();
// Outlast the ALB's 60s idle timeout, so the ALB never reuses a socket Node just closed (a 502).
httpServer.keepAliveTimeout = 65_000;
httpServer.headersTimeout = 66_000;
const io = createSocketServer(httpServer, { prisma, verifyToken });
io.adapter(createAdapter(adapterPub, adapterSub));

// API writes emit through the adapter (reaches sockets on every replica).
const events = createSocketSink(io);
const app = createApp({
  prisma,
  userServiceUrl: env.USER_SERVICE_URL,
  supplierServiceUrl: env.SUPPLIER_SERVICE_URL,
  creditServiceUrl: env.CREDIT_SERVICE_URL,
  supplierServiceKey: env.ORDER_SUPPLIER_SERVICE_API_KEY,
  events,
});
httpServer.on('request', app);

// Every replica receives the worker's events, so each emits to its own sockets only.
void relayWorkerEvents(
  workerEvents,
  createSocketSink(io, { local: true }),
).catch((err: unknown) =>
  console.error('Could not subscribe to worker events:', err),
);

httpServer.listen(env.PORT, () => {
  console.log(`order-service listening on :${env.PORT} (${env.NODE_ENV})`);
});

// Graceful shutdown on `docker stop` (SIGTERM) / Ctrl+C (SIGINT).
let shuttingDown = false;
function shutdown(signal: NodeJS.Signals): void {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`${signal} received, shutting down`);
  setTimeout(() => process.exit(1), 10_000).unref();
  // io.close() also closes the HTTP server.
  void io.close((err) => {
    for (const r of [adapterPub, adapterSub, workerEvents]) r.disconnect();
    void prisma.$disconnect().finally(() => process.exit(err ? 1 : 0));
  });
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
