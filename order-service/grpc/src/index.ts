// AI Assistance Disclosure: Claude Opus (Cursor), 2026-11-05.
// Prompt: improve index.ts to ensure supplier/order pub-sub works for the supplier cache.
// Scope: Redis supplier cache wiring and one broker connection for user and supplier events.
// Author review: Added in redis client and cache to app, reviewed by @sunpterodactyl.
// ChatGPT (Codex), 2026-11-02: Start/close the shared User-event consumer; review pending; see ../../usage-log.md.
// ChatGPT (Codex), 2026-11-02: Wire mandatory shared User lookup for acceptance; review pending; see ../../usage-log.md.
// AI Assistance Disclosure: ChatGPT (Codex), 2026-10-22.
// Scope: Generated approved service startup; adopted shared @foc/grpc Credit client on 2026-10-22.
// Author review: Pending; see ../../usage-log.md.
import { startOrderSubscriptions } from './events/broker';
import { readFileSync } from 'node:fs';
import { Metadata } from '@grpc/grpc-js';
import { createDirectories } from './dependencies/directories';
import { createRedisClient, waitForRedis } from './dependencies/redis';
import { createSupplierCache } from './dependencies/supplierCache';
import { createOrderCreation } from './services/orderCreation';
import { createOrderEdits } from './services/orderEdits';
import { createOrderLifecycle } from './services/orderLifecycle';
import { createOrderAcceptance } from './services/orderAcceptance';
import { once } from 'node:events';
import { createCreditClient, startServer, stopServer, type RpcOptions } from '@foc/grpc';
import { env } from './env';
import { prisma } from './db';
import { createApp } from './api/app';
import { createGrpcServer } from './grpc/server';

async function main(): Promise<void> {
  await prisma.$connect();
  const grpcServer = createGrpcServer(prisma);
  const publicKey = env.USER_SERVICE_PUBLIC_KEY_PATH ? readFileSync(env.USER_SERVICE_PUBLIC_KEY_PATH, 'utf8') : undefined;
  const credit = env.CREDIT_ORDER_SERVICE_TOKEN ? createCreditClient(env.CREDIT_GRPC_ADDR,
    { timeoutMs: env.GRPC_TIMEOUT_MS }) : undefined;
  const metadata = new Metadata();
  if (env.CREDIT_ORDER_SERVICE_TOKEN) metadata.set('x-credit-service-token', env.CREDIT_ORDER_SERVICE_TOKEN);
  const creditOptions: RpcOptions = { metadata };
  const redis = env.REDIS_URL ? createRedisClient(env.REDIS_URL) : undefined;
  if (redis && !(await waitForRedis(redis, 2000))) console.warn('Redis not ready at startup; supplier lookups use gRPC until it connects');
  else if (!redis) console.info('Order supplier cache disabled: REDIS_URL not configured');
  const supplierCache = redis ? createSupplierCache(redis, env.SUPPLIER_CACHE_TTL_SECONDS) : undefined;
  const directories = createDirectories(env.USER_GRPC_ADDR, env.SUPPLIER_GRPC_ADDR, env.GRPC_TIMEOUT_MS, supplierCache);
  const creation = credit ? createOrderCreation(prisma, credit, directories, creditOptions) : undefined;
  const edits = credit ? createOrderEdits(prisma, credit, directories, creditOptions) : undefined;
  const lifecycle = credit ? createOrderLifecycle(prisma, credit, [() => creation!.recoverBatch(), () => edits!.recoverBatch()], creditOptions) : undefined;
  const acceptance = createOrderAcceptance(prisma, {
    getPublicProfile: ({ userId }) => directories.getRequester(userId),
  });
  const httpServer = createApp(publicKey, lifecycle, creation, edits, acceptance).listen(env.PORT);
  let broker: Awaited<ReturnType<typeof startOrderSubscriptions>> | undefined;
  try {
    await once(httpServer, 'listening');
    await startServer(grpcServer, env.GRPC_PORT, env.GRPC_HOST);
    if (env.RABBITMQ_URL) broker = await startOrderSubscriptions(prisma, env.RABBITMQ_URL,
      { cache: supplierCache, fetchSupplier: directories.fetchSupplier });
    else console.info("Order user.deleted and supplier-event subscriptions disabled: RABBITMQ_URL not configured");
  } catch (error) {
    httpServer.close();
    grpcServer.forceShutdown();
    credit?.close();
    directories.close();
    redis?.disconnect();
    await prisma.$disconnect();
    throw error;
  }
  console.log(`Order REST listening on :${env.PORT}; gRPC on ${env.GRPC_HOST}:${env.GRPC_PORT}`);

  lifecycle?.startWorker();
  let shuttingDown = false;
  const shutdown = async (): Promise<void> => {
    if (shuttingDown) return;
    shuttingDown = true;
    await broker?.close();
    await lifecycle?.stopWorker();
    await Promise.all([
      new Promise<void>((resolve, reject) => httpServer.close((error) => error ? reject(error) : resolve())),
      stopServer(grpcServer),
    ]);
    credit?.close();
    directories.close();
    redis?.disconnect();
    await prisma.$disconnect();
  };
  for (const signal of ['SIGINT', 'SIGTERM']) {
    process.on(signal, () => void shutdown().catch((error: unknown) => {
      console.error('Shutdown failed:', error);
      process.exitCode = 1;
    }));
  }
}

main().catch(async (error: unknown) => {
  console.error('Fatal error during startup:', error);
  await prisma.$disconnect();
  process.exitCode = 1;
});
