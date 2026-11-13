// Original file: proto/order.proto

import type { OrderStatus as _order_OrderStatus, OrderStatus__Output as _order_OrderStatus__Output } from '../order/OrderStatus';
import type { Timestamp as _google_protobuf_Timestamp, Timestamp__Output as _google_protobuf_Timestamp__Output } from '../google/protobuf/Timestamp';
import type { Long } from '@grpc/proto-loader';

export interface Order {
  'orderId'?: (string);
  'requesterId'?: (string);
  'courierId'?: (string);
  'supplierId'?: (number | string | Long);
  'deliveryLocation'?: (string);
  'instructions'?: (string);
  'credits'?: (number);
  'status'?: (_order_OrderStatus);
  'deadline'?: (_google_protobuf_Timestamp | null);
}

export interface Order__Output {
  'orderId': (string);
  'requesterId': (string);
  'courierId': (string);
  'supplierId': (string);
  'deliveryLocation': (string);
  'instructions': (string);
  'credits': (number);
  'status': (_order_OrderStatus__Output);
  'deadline': (_google_protobuf_Timestamp__Output | null);
}
