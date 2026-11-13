// Original file: proto/supplier.proto

import type { Long } from '@grpc/proto-loader';

export interface IsOpenRequest {
  'supplierId'?: (number | string | Long);
}

export interface IsOpenRequest__Output {
  'supplierId': (string);
}
