import { RabbitMQClient, CREDIT_USER_QUEUE } from '@foc/messaging';
import { env } from './env';
import { prisma } from './db';
import { createApp } from './api/app';
import { startGrpcServer } from './grpc/server';
import { OutboxStore } from './events/outboxStore';
import { startDispatcher } from './events/outboxDispatcher';

// Boots both servers: Express (REST) and gRPC (internal RPC).
async function main(): Promise<void> {
  const app = createApp();
  const httpServer = app.listen(env.PORT, () => {
    console.log(`REST server listening on http://localhost:${env.PORT}`);
  });

  const grpcServer = await startGrpcServer(env.GRPC_PORT);
  console.log(`gRPC server listening on 0.0.0.0:${env.GRPC_PORT}`);

  const broker = new RabbitMQClient({
    url: env.RABBITMQ_URL,
    serviceName: 'user-service',
    queues: [CREDIT_USER_QUEUE],
    prefetch: 10,
  });
  let brokerReady = false;
  async function connectBroker(): Promise<void> {
    if (brokerReady) return;
    await broker.connect();
    brokerReady = true;
  }
  try {
    await connectBroker();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(
      'RabbitMQ unavailable at boot; sign-up will still work, outbox will retry',
      message,
    );
  }

  const publishingBroker = {
    async publishToQueue(queue: string, message: object, eventId?: string) {
      await connectBroker();
      try {
        return await broker.publishToQueue(queue, message, eventId);
      } catch (err) {
        brokerReady = false;
        try {
          await broker.close();
        } catch {
          // ignore close errors while resetting
        }
        throw err;
      }
    },
  };

  const stopDispatcher = startDispatcher({
    store: new OutboxStore(prisma),
    broker: publishingBroker,
    intervalMs: env.OUTBOX_POLL_INTERVAL_MS,
    batchSize: env.OUTBOX_BATCH_SIZE,
  });

  // Close servers and the DB pool.
  const shutdown = async (signal: string): Promise<void> => {
    console.log(`\n${signal} received — shutting down...`);
    stopDispatcher();
    httpServer.close();
    grpcServer.forceShutdown();
    try {
      await broker.close();
    } catch {
      // already closed or never connected
    }
    await prisma.$disconnect();
    process.exit(0);
  };

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

main().catch((err) => {
  console.error('Fatal error during startup:', err);
  process.exit(1);
});
