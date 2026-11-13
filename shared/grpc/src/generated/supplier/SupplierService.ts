// Original file: proto/supplier.proto

import type * as grpc from '@grpc/grpc-js'
import type { MethodDefinition } from '@grpc/proto-loader'
import type { GetSupplierRequest as _supplier_GetSupplierRequest, GetSupplierRequest__Output as _supplier_GetSupplierRequest__Output } from '../supplier/GetSupplierRequest';
import type { Supplier as _supplier_Supplier, Supplier__Output as _supplier_Supplier__Output } from '../supplier/Supplier';

export interface SupplierServiceClient extends grpc.Client {
  GetSupplier(argument: _supplier_GetSupplierRequest, metadata: grpc.Metadata, options: grpc.CallOptions, callback: grpc.requestCallback<_supplier_Supplier__Output>): grpc.ClientUnaryCall;
  GetSupplier(argument: _supplier_GetSupplierRequest, metadata: grpc.Metadata, callback: grpc.requestCallback<_supplier_Supplier__Output>): grpc.ClientUnaryCall;
  GetSupplier(argument: _supplier_GetSupplierRequest, options: grpc.CallOptions, callback: grpc.requestCallback<_supplier_Supplier__Output>): grpc.ClientUnaryCall;
  GetSupplier(argument: _supplier_GetSupplierRequest, callback: grpc.requestCallback<_supplier_Supplier__Output>): grpc.ClientUnaryCall;
  getSupplier(argument: _supplier_GetSupplierRequest, metadata: grpc.Metadata, options: grpc.CallOptions, callback: grpc.requestCallback<_supplier_Supplier__Output>): grpc.ClientUnaryCall;
  getSupplier(argument: _supplier_GetSupplierRequest, metadata: grpc.Metadata, callback: grpc.requestCallback<_supplier_Supplier__Output>): grpc.ClientUnaryCall;
  getSupplier(argument: _supplier_GetSupplierRequest, options: grpc.CallOptions, callback: grpc.requestCallback<_supplier_Supplier__Output>): grpc.ClientUnaryCall;
  getSupplier(argument: _supplier_GetSupplierRequest, callback: grpc.requestCallback<_supplier_Supplier__Output>): grpc.ClientUnaryCall;
  
}

export interface SupplierServiceHandlers extends grpc.UntypedServiceImplementation {
  GetSupplier: grpc.handleUnaryCall<_supplier_GetSupplierRequest__Output, _supplier_Supplier>;
  
}

export interface SupplierServiceDefinition extends grpc.ServiceDefinition {
  GetSupplier: MethodDefinition<_supplier_GetSupplierRequest, _supplier_Supplier, _supplier_GetSupplierRequest__Output, _supplier_Supplier__Output>
}
