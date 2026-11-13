// AI Assistance Disclosure: ChatGPT (Codex), 2026-11-02. Generated from the human-approved eligibility contract; review pending; see order-service/usage-log.md.
// Original file: proto/order.proto

import type * as grpc from '@grpc/grpc-js'
import type { MethodDefinition } from '@grpc/proto-loader'
import type { CheckDeletionEligibilityRequest as _order_CheckDeletionEligibilityRequest, CheckDeletionEligibilityRequest__Output as _order_CheckDeletionEligibilityRequest__Output } from '../order/CheckDeletionEligibilityRequest';
import type { CheckDeletionEligibilityResponse as _order_CheckDeletionEligibilityResponse, CheckDeletionEligibilityResponse__Output as _order_CheckDeletionEligibilityResponse__Output } from '../order/CheckDeletionEligibilityResponse';
import type { GetOrderRequest as _order_GetOrderRequest, GetOrderRequest__Output as _order_GetOrderRequest__Output } from '../order/GetOrderRequest';
import type { Order as _order_Order, Order__Output as _order_Order__Output } from '../order/Order';

export interface OrderServiceClient extends grpc.Client {
  CheckDeletionEligibility(argument: _order_CheckDeletionEligibilityRequest, metadata: grpc.Metadata, options: grpc.CallOptions, callback: grpc.requestCallback<_order_CheckDeletionEligibilityResponse__Output>): grpc.ClientUnaryCall;
  CheckDeletionEligibility(argument: _order_CheckDeletionEligibilityRequest, metadata: grpc.Metadata, callback: grpc.requestCallback<_order_CheckDeletionEligibilityResponse__Output>): grpc.ClientUnaryCall;
  CheckDeletionEligibility(argument: _order_CheckDeletionEligibilityRequest, options: grpc.CallOptions, callback: grpc.requestCallback<_order_CheckDeletionEligibilityResponse__Output>): grpc.ClientUnaryCall;
  CheckDeletionEligibility(argument: _order_CheckDeletionEligibilityRequest, callback: grpc.requestCallback<_order_CheckDeletionEligibilityResponse__Output>): grpc.ClientUnaryCall;
  checkDeletionEligibility(argument: _order_CheckDeletionEligibilityRequest, metadata: grpc.Metadata, options: grpc.CallOptions, callback: grpc.requestCallback<_order_CheckDeletionEligibilityResponse__Output>): grpc.ClientUnaryCall;
  checkDeletionEligibility(argument: _order_CheckDeletionEligibilityRequest, metadata: grpc.Metadata, callback: grpc.requestCallback<_order_CheckDeletionEligibilityResponse__Output>): grpc.ClientUnaryCall;
  checkDeletionEligibility(argument: _order_CheckDeletionEligibilityRequest, options: grpc.CallOptions, callback: grpc.requestCallback<_order_CheckDeletionEligibilityResponse__Output>): grpc.ClientUnaryCall;
  checkDeletionEligibility(argument: _order_CheckDeletionEligibilityRequest, callback: grpc.requestCallback<_order_CheckDeletionEligibilityResponse__Output>): grpc.ClientUnaryCall;

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
  CheckDeletionEligibility: grpc.handleUnaryCall<_order_CheckDeletionEligibilityRequest__Output, _order_CheckDeletionEligibilityResponse>;

  GetOrder: grpc.handleUnaryCall<_order_GetOrderRequest__Output, _order_Order>;

}

export interface OrderServiceDefinition extends grpc.ServiceDefinition {
  CheckDeletionEligibility: MethodDefinition<_order_CheckDeletionEligibilityRequest, _order_CheckDeletionEligibilityResponse, _order_CheckDeletionEligibilityRequest__Output, _order_CheckDeletionEligibilityResponse__Output>
  GetOrder: MethodDefinition<_order_GetOrderRequest, _order_Order, _order_GetOrderRequest__Output, _order_Order__Output>
}
