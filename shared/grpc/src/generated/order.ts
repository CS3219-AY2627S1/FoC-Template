import type * as grpc from '@grpc/grpc-js';
import type { EnumTypeDefinition, MessageTypeDefinition } from '@grpc/proto-loader';

import type { Timestamp as _google_protobuf_Timestamp, Timestamp__Output as _google_protobuf_Timestamp__Output } from './google/protobuf/Timestamp';
import type { GetOrderRequest as _order_GetOrderRequest, GetOrderRequest__Output as _order_GetOrderRequest__Output } from './order/GetOrderRequest';
import type { Order as _order_Order, Order__Output as _order_Order__Output } from './order/Order';
import type { OrderServiceClient as _order_OrderServiceClient, OrderServiceDefinition as _order_OrderServiceDefinition } from './order/OrderService';

type SubtypeConstructor<Constructor extends new (...args: any) => any, Subtype> = {
  new(...args: ConstructorParameters<Constructor>): Subtype;
};

export interface ProtoGrpcType {
  google: {
    protobuf: {
      Timestamp: MessageTypeDefinition<_google_protobuf_Timestamp, _google_protobuf_Timestamp__Output>
    }
  }
  order: {
    GetOrderRequest: MessageTypeDefinition<_order_GetOrderRequest, _order_GetOrderRequest__Output>
    Order: MessageTypeDefinition<_order_Order, _order_Order__Output>
    OrderService: SubtypeConstructor<typeof grpc.Client, _order_OrderServiceClient> & { service: _order_OrderServiceDefinition }
    OrderStatus: EnumTypeDefinition
  }
}

