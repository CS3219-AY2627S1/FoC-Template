import { createPeerClients } from '@foc/grpc';

// Opt-in example only: this is not imported by the existing User Service.
// The root workspace installs/builds @foc/grpc for this example. To integrate it
// later, declare @foc/grpc as a User Service dependency and wire it into startup.
export function createClients() {
  return createPeerClients(
    {
      user: process.env.USER_GRPC_ADDR ?? 'localhost:50051',
      order: process.env.ORDER_GRPC_ADDR ?? 'localhost:50053',
      credit: process.env.CREDIT_GRPC_ADDR ?? 'localhost:50054',
      supplier: process.env.SUPPLIER_GRPC_ADDR ?? 'localhost:50052',
    },
    { timeoutMs: Number(process.env.GRPC_TIMEOUT_MS ?? 3000) },
  );
}

// Usage from a future business handler:
// const clients = createClients();
// const balance = await clients.credit.getBalance({ userId });
// clients.close(); // once, during service shutdown
