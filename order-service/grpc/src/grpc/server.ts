import { OrderService, createServer, unimplemented, type OrderServiceHandlers } from '@foc/grpc';

export const handlers: OrderServiceHandlers = {
  GetOrder: unimplemented('GetOrder'),
};

export function createGrpcServer() {
  return createServer(OrderService.service, handlers);
}
