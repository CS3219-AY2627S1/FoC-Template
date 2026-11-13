import type * as grpc from '@grpc/grpc-js';
import type { MessageTypeDefinition } from '@grpc/proto-loader';

import type { GetSupplierRequest as _supplier_GetSupplierRequest, GetSupplierRequest__Output as _supplier_GetSupplierRequest__Output } from './supplier/GetSupplierRequest';
import type { Supplier as _supplier_Supplier, Supplier__Output as _supplier_Supplier__Output } from './supplier/Supplier';
import type { SupplierServiceClient as _supplier_SupplierServiceClient, SupplierServiceDefinition as _supplier_SupplierServiceDefinition } from './supplier/SupplierService';

type SubtypeConstructor<Constructor extends new (...args: any) => any, Subtype> = {
  new(...args: ConstructorParameters<Constructor>): Subtype;
};

export interface ProtoGrpcType {
  supplier: {
    GetSupplierRequest: MessageTypeDefinition<_supplier_GetSupplierRequest, _supplier_GetSupplierRequest__Output>
    Supplier: MessageTypeDefinition<_supplier_Supplier, _supplier_Supplier__Output>
    SupplierService: SubtypeConstructor<typeof grpc.Client, _supplier_SupplierServiceClient> & { service: _supplier_SupplierServiceDefinition }
  }
}

