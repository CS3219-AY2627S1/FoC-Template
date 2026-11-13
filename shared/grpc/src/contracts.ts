import path from 'node:path';
import { loadPackageDefinition } from '@grpc/grpc-js';
import { loadSync } from '@grpc/proto-loader';
import type { ProtoGrpcType as UserProto } from './generated/user';
import type { ProtoGrpcType as OrderProto } from './generated/order';
import type { ProtoGrpcType as CreditProto } from './generated/credit';
import type { ProtoGrpcType as SupplierProto } from './generated/supplier';

// These options must match the type-generation script. JS fields use camelCase.
const definition = loadSync(
  [
    // Reuse the existing User Service contract without moving or changing it.
    path.resolve(__dirname, '../../../user-service/proto/user.proto'),
    path.resolve(__dirname, '../proto/order.proto'),
    path.resolve(__dirname, '../proto/credit.proto'),
    path.resolve(__dirname, '../proto/supplier.proto'),
  ],
  {
    keepCase: false,
    longs: String,
    enums: String,
    defaults: true,
    oneofs: true,
  },
);

const proto = loadPackageDefinition(definition) as unknown as UserProto &
  OrderProto &
  CreditProto &
  SupplierProto;

export const UserService = proto.user.UserService;
export const OrderService = proto.order.OrderService;
export const CreditService = proto.credit.CreditService;
export const SupplierService = proto.supplier.SupplierService;

export type { UserServiceHandlers } from './generated/user/UserService';
export type { OrderServiceHandlers } from './generated/order/OrderService';
export type { CreditServiceHandlers } from './generated/credit/CreditService';
export type { SupplierServiceHandlers } from './generated/supplier/SupplierService';
