// Original file: proto/order.proto

import type * as grpc from '@grpc/grpc-js'
import type { MethodDefinition } from '@grpc/proto-loader'
import type { GetOrderRequest as _order_GetOrderRequest, GetOrderRequest__Output as _order_GetOrderRequest__Output } from '../order/GetOrderRequest';
import type { Order as _order_Order, Order__Output as _order_Order__Output } from '../order/Order';

export interface OrderServiceClient extends grpc.Client {
  GetOrder(argument: _order_GetOrderRequest, metadata: grpc.Metadata, options: grpc.CallOptions, callback: grpc.requestCallback<_order_Order__Output>): grpc.ClientUnaryCall;
  GetOrder(argument: _order_GetOrderRequest, metadata: grpc.Metadata, callback: grpc.requestCallback<_order_Order__Output>): grpc.ClientUnaryCall;
  GetOrder(argument: _order_GetOrderRequest, options: grpc.CallOptions, callback: grpc.requestCallback<_order_Order__Output>): grpc.ClientUnaryCall;
  GetOrder(argument: _order_GetOrderRequest, callback: grpc.requestCallback<_order_Order__Output>): grpc.ClientUnaryCall;
  getOrder(argument: _order_GetOrderRequest, metadata: grpc.Metadata, options: grpc.CallOptions, callback: grpc.requestCallback<_order_Order__Output>): grpc.ClientUnaryCall;
  getOrder(argument: _order_GetOrderRequest, metadata: grpc.Metadata, callback: grpc.requestCallback<_order_Order__Output>): grpc.ClientUnaryCall;
  getOrder(argument: _order_GetOrderRequest, options: grpc.CallOptions, callback: grpc.requestCallback<_order_Order__Output>): grpc.ClientUnaryCall;
  getOrder(argument: _order_GetOrderRequest, callback: grpc.requestCallback<_order_Order__Output>): grpc.ClientUnaryCall;
  
}

export interface OrderServiceHandlers extends grpc.UntypedServiceImplementation {
  GetOrder: grpc.handleUnaryCall<_order_GetOrderRequest__Output, _order_Order>;
  
}

export interface OrderServiceDefinition extends grpc.ServiceDefinition {
  GetOrder: MethodDefinition<_order_GetOrderRequest, _order_Order, _order_GetOrderRequest__Output, _order_Order__Output>
}
