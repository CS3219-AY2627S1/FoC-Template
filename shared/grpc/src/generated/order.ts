// AI Assistance Disclosure: ChatGPT (Codex), 2026-11-02. Generated from the human-approved eligibility contract; review pending; see order-service/usage-log.md.
import type * as grpc from '@grpc/grpc-js';
import type { EnumTypeDefinition, MessageTypeDefinition } from '@grpc/proto-loader';

import type { Timestamp as _google_protobuf_Timestamp, Timestamp__Output as _google_protobuf_Timestamp__Output } from './google/protobuf/Timestamp';
import type { CheckDeletionEligibilityRequest as _order_CheckDeletionEligibilityRequest, CheckDeletionEligibilityRequest__Output as _order_CheckDeletionEligibilityRequest__Output } from './order/CheckDeletionEligibilityRequest';
import type { CheckDeletionEligibilityResponse as _order_CheckDeletionEligibilityResponse, CheckDeletionEligibilityResponse__Output as _order_CheckDeletionEligibilityResponse__Output } from './order/CheckDeletionEligibilityResponse';
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
    CheckDeletionEligibilityRequest: MessageTypeDefinition<_order_CheckDeletionEligibilityRequest, _order_CheckDeletionEligibilityRequest__Output>
    CheckDeletionEligibilityResponse: MessageTypeDefinition<_order_CheckDeletionEligibilityResponse, _order_CheckDeletionEligibilityResponse__Output>
    GetOrderRequest: MessageTypeDefinition<_order_GetOrderRequest, _order_GetOrderRequest__Output>
    Order: MessageTypeDefinition<_order_Order, _order_Order__Output>
    OrderService: SubtypeConstructor<typeof grpc.Client, _order_OrderServiceClient> & { service: _order_OrderServiceDefinition }
    OrderStatus: EnumTypeDefinition
  }
}

