// Original file: proto/supplier.proto

import type { Long } from '@grpc/proto-loader';

export interface GetSupplierRequest {
  'supplierId'?: (number | string | Long);
}

export interface GetSupplierRequest__Output {
  'supplierId': (string);
}
