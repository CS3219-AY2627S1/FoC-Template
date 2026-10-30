// Original file: proto/supplier.proto

import type { Long } from '@grpc/proto-loader';

export interface Supplier {
  'supplierId'?: (number | string | Long);
  'name'?: (string);
  'type'?: (string);
  'buildingName'?: (string);
  'floor'?: (number);
  'locationDescription'?: (string);
  'latitude'?: (number | string);
  'longitude'?: (number | string);
  'startingTime'?: (string);
  'closingTime'?: (string);
  'imageUrl'?: (string);
  '_startingTime'?: "startingTime";
  '_closingTime'?: "closingTime";
  '_imageUrl'?: "imageUrl";
}

export interface Supplier__Output {
  'supplierId': (string);
  'name': (string);
  'type': (string);
  'buildingName': (string);
  'floor': (number);
  'locationDescription': (string);
  'latitude': (number);
  'longitude': (number);
  'startingTime'?: (string);
  'closingTime'?: (string);
  'imageUrl'?: (string);
  '_startingTime'?: "startingTime";
  '_closingTime'?: "closingTime";
  '_imageUrl'?: "imageUrl";
}
