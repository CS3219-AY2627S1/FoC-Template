import { startServer, stopServer } from '@foc/grpc';
import { env } from './env';
import { createGrpcServer } from './grpc/server';
import { createClients } from './grpc/clients';

async function main(): Promise<void> {
  const server = createGrpcServer();
  const port = await startServer(server, env.GRPC_PORT, env.GRPC_HOST);
  const clients = createClients();
  console.log('supplier-service gRPC listening on ' + env.GRPC_HOST + ':' + port);

  let shuttingDown = false;
  const shutdown = async (): Promise<void> => {
    if (shuttingDown) return;
    shuttingDown = true;
    await stopServer(server);
    clients.close();
  };
  process.on('SIGINT', () => void shutdown());
  process.on('SIGTERM', () => void shutdown());
}

main().catch((error: unknown) => {
  console.error('Fatal error during startup:', error);
  process.exit(1);
});
