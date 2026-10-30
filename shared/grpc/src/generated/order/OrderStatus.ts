// Original file: proto/order.proto

export const OrderStatus = {
  ORDER_STATUS_UNSPECIFIED: 'ORDER_STATUS_UNSPECIFIED',
  OPEN: 'OPEN',
  ACCEPTED: 'ACCEPTED',
  PICKED_UP: 'PICKED_UP',
  DELIVERED: 'DELIVERED',
  COMPLETED: 'COMPLETED',
  CANCELLED: 'CANCELLED',
  EXPIRED: 'EXPIRED',
} as const;

export type OrderStatus =
  | 'ORDER_STATUS_UNSPECIFIED'
  | 0
  | 'OPEN'
  | 1
  | 'ACCEPTED'
  | 2
  | 'PICKED_UP'
  | 3
  | 'DELIVERED'
  | 4
  | 'COMPLETED'
  | 5
  | 'CANCELLED'
  | 6
  | 'EXPIRED'
  | 7

export type OrderStatus__Output = typeof OrderStatus[keyof typeof OrderStatus]
