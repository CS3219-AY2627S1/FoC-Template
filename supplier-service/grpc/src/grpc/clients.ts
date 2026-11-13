import { createPeerClients } from '@foc/grpc';
import { env } from '../env';

// Reuse these channels across requests; close them during shutdown.
export function createClients() {
  return createPeerClients(
    {
      user: env.USER_GRPC_ADDR,
      order: env.ORDER_GRPC_ADDR,
      credit: env.CREDIT_GRPC_ADDR,
      supplier: env.SUPPLIER_GRPC_ADDR,
    },
    { timeoutMs: env.GRPC_TIMEOUT_MS },
  );
}
