// Original file: proto/credit.proto

import type { ReservationStatus as _credit_ReservationStatus, ReservationStatus__Output as _credit_ReservationStatus__Output } from '../credit/ReservationStatus';

export interface Reservation {
  'orderId'?: (string);
  'requesterId'?: (string);
  'amount'?: (number);
  'status'?: (_credit_ReservationStatus);
  'courierId'?: (string);
  'reservationId'?: (string);
  'version'?: (number);
  '_courierId'?: "courierId";
}

export interface Reservation__Output {
  'orderId': (string);
  'requesterId': (string);
  'amount': (number);
  'status': (_credit_ReservationStatus__Output);
  'courierId'?: (string);
  'reservationId': (string);
  'version': (number);
  '_courierId'?: "courierId";
}
