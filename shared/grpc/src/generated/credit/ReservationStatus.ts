// Original file: proto/credit.proto

export const ReservationStatus = {
  RESERVATION_STATUS_UNSPECIFIED: 'RESERVATION_STATUS_UNSPECIFIED',
  RESERVED: 'RESERVED',
  RELEASED: 'RELEASED',
  SETTLED: 'SETTLED',
} as const;

export type ReservationStatus =
  | 'RESERVATION_STATUS_UNSPECIFIED'
  | 0
  | 'RESERVED'
  | 1
  | 'RELEASED'
  | 2
  | 'SETTLED'
  | 3

export type ReservationStatus__Output = typeof ReservationStatus[keyof typeof ReservationStatus]
