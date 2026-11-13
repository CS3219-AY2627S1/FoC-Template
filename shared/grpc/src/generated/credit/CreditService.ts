// Original file: proto/credit.proto

import type * as grpc from '@grpc/grpc-js'
import type { MethodDefinition } from '@grpc/proto-loader'
import type { Balance as _credit_Balance, Balance__Output as _credit_Balance__Output } from '../credit/Balance';
import type { GetBalanceRequest as _credit_GetBalanceRequest, GetBalanceRequest__Output as _credit_GetBalanceRequest__Output } from '../credit/GetBalanceRequest';
import type { GetReservationRequest as _credit_GetReservationRequest, GetReservationRequest__Output as _credit_GetReservationRequest__Output } from '../credit/GetReservationRequest';
import type { ReleaseCreditsRequest as _credit_ReleaseCreditsRequest, ReleaseCreditsRequest__Output as _credit_ReleaseCreditsRequest__Output } from '../credit/ReleaseCreditsRequest';
import type { Reservation as _credit_Reservation, Reservation__Output as _credit_Reservation__Output } from '../credit/Reservation';
import type { ReserveCreditsRequest as _credit_ReserveCreditsRequest, ReserveCreditsRequest__Output as _credit_ReserveCreditsRequest__Output } from '../credit/ReserveCreditsRequest';
import type { SettleCreditsRequest as _credit_SettleCreditsRequest, SettleCreditsRequest__Output as _credit_SettleCreditsRequest__Output } from '../credit/SettleCreditsRequest';
import type { UpdateReservationRequest as _credit_UpdateReservationRequest, UpdateReservationRequest__Output as _credit_UpdateReservationRequest__Output } from '../credit/UpdateReservationRequest';

export interface CreditServiceClient extends grpc.Client {
  GetBalance(argument: _credit_GetBalanceRequest, metadata: grpc.Metadata, options: grpc.CallOptions, callback: grpc.requestCallback<_credit_Balance__Output>): grpc.ClientUnaryCall;
  GetBalance(argument: _credit_GetBalanceRequest, metadata: grpc.Metadata, callback: grpc.requestCallback<_credit_Balance__Output>): grpc.ClientUnaryCall;
  GetBalance(argument: _credit_GetBalanceRequest, options: grpc.CallOptions, callback: grpc.requestCallback<_credit_Balance__Output>): grpc.ClientUnaryCall;
  GetBalance(argument: _credit_GetBalanceRequest, callback: grpc.requestCallback<_credit_Balance__Output>): grpc.ClientUnaryCall;
  getBalance(argument: _credit_GetBalanceRequest, metadata: grpc.Metadata, options: grpc.CallOptions, callback: grpc.requestCallback<_credit_Balance__Output>): grpc.ClientUnaryCall;
  getBalance(argument: _credit_GetBalanceRequest, metadata: grpc.Metadata, callback: grpc.requestCallback<_credit_Balance__Output>): grpc.ClientUnaryCall;
  getBalance(argument: _credit_GetBalanceRequest, options: grpc.CallOptions, callback: grpc.requestCallback<_credit_Balance__Output>): grpc.ClientUnaryCall;
  getBalance(argument: _credit_GetBalanceRequest, callback: grpc.requestCallback<_credit_Balance__Output>): grpc.ClientUnaryCall;
  
  GetReservation(argument: _credit_GetReservationRequest, metadata: grpc.Metadata, options: grpc.CallOptions, callback: grpc.requestCallback<_credit_Reservation__Output>): grpc.ClientUnaryCall;
  GetReservation(argument: _credit_GetReservationRequest, metadata: grpc.Metadata, callback: grpc.requestCallback<_credit_Reservation__Output>): grpc.ClientUnaryCall;
  GetReservation(argument: _credit_GetReservationRequest, options: grpc.CallOptions, callback: grpc.requestCallback<_credit_Reservation__Output>): grpc.ClientUnaryCall;
  GetReservation(argument: _credit_GetReservationRequest, callback: grpc.requestCallback<_credit_Reservation__Output>): grpc.ClientUnaryCall;
  getReservation(argument: _credit_GetReservationRequest, metadata: grpc.Metadata, options: grpc.CallOptions, callback: grpc.requestCallback<_credit_Reservation__Output>): grpc.ClientUnaryCall;
  getReservation(argument: _credit_GetReservationRequest, metadata: grpc.Metadata, callback: grpc.requestCallback<_credit_Reservation__Output>): grpc.ClientUnaryCall;
  getReservation(argument: _credit_GetReservationRequest, options: grpc.CallOptions, callback: grpc.requestCallback<_credit_Reservation__Output>): grpc.ClientUnaryCall;
  getReservation(argument: _credit_GetReservationRequest, callback: grpc.requestCallback<_credit_Reservation__Output>): grpc.ClientUnaryCall;
  
  ReleaseCredits(argument: _credit_ReleaseCreditsRequest, metadata: grpc.Metadata, options: grpc.CallOptions, callback: grpc.requestCallback<_credit_Reservation__Output>): grpc.ClientUnaryCall;
  ReleaseCredits(argument: _credit_ReleaseCreditsRequest, metadata: grpc.Metadata, callback: grpc.requestCallback<_credit_Reservation__Output>): grpc.ClientUnaryCall;
  ReleaseCredits(argument: _credit_ReleaseCreditsRequest, options: grpc.CallOptions, callback: grpc.requestCallback<_credit_Reservation__Output>): grpc.ClientUnaryCall;
  ReleaseCredits(argument: _credit_ReleaseCreditsRequest, callback: grpc.requestCallback<_credit_Reservation__Output>): grpc.ClientUnaryCall;
  releaseCredits(argument: _credit_ReleaseCreditsRequest, metadata: grpc.Metadata, options: grpc.CallOptions, callback: grpc.requestCallback<_credit_Reservation__Output>): grpc.ClientUnaryCall;
  releaseCredits(argument: _credit_ReleaseCreditsRequest, metadata: grpc.Metadata, callback: grpc.requestCallback<_credit_Reservation__Output>): grpc.ClientUnaryCall;
  releaseCredits(argument: _credit_ReleaseCreditsRequest, options: grpc.CallOptions, callback: grpc.requestCallback<_credit_Reservation__Output>): grpc.ClientUnaryCall;
  releaseCredits(argument: _credit_ReleaseCreditsRequest, callback: grpc.requestCallback<_credit_Reservation__Output>): grpc.ClientUnaryCall;
  
  ReserveCredits(argument: _credit_ReserveCreditsRequest, metadata: grpc.Metadata, options: grpc.CallOptions, callback: grpc.requestCallback<_credit_Reservation__Output>): grpc.ClientUnaryCall;
  ReserveCredits(argument: _credit_ReserveCreditsRequest, metadata: grpc.Metadata, callback: grpc.requestCallback<_credit_Reservation__Output>): grpc.ClientUnaryCall;
  ReserveCredits(argument: _credit_ReserveCreditsRequest, options: grpc.CallOptions, callback: grpc.requestCallback<_credit_Reservation__Output>): grpc.ClientUnaryCall;
  ReserveCredits(argument: _credit_ReserveCreditsRequest, callback: grpc.requestCallback<_credit_Reservation__Output>): grpc.ClientUnaryCall;
  reserveCredits(argument: _credit_ReserveCreditsRequest, metadata: grpc.Metadata, options: grpc.CallOptions, callback: grpc.requestCallback<_credit_Reservation__Output>): grpc.ClientUnaryCall;
  reserveCredits(argument: _credit_ReserveCreditsRequest, metadata: grpc.Metadata, callback: grpc.requestCallback<_credit_Reservation__Output>): grpc.ClientUnaryCall;
  reserveCredits(argument: _credit_ReserveCreditsRequest, options: grpc.CallOptions, callback: grpc.requestCallback<_credit_Reservation__Output>): grpc.ClientUnaryCall;
  reserveCredits(argument: _credit_ReserveCreditsRequest, callback: grpc.requestCallback<_credit_Reservation__Output>): grpc.ClientUnaryCall;
  
  SettleCredits(argument: _credit_SettleCreditsRequest, metadata: grpc.Metadata, options: grpc.CallOptions, callback: grpc.requestCallback<_credit_Reservation__Output>): grpc.ClientUnaryCall;
  SettleCredits(argument: _credit_SettleCreditsRequest, metadata: grpc.Metadata, callback: grpc.requestCallback<_credit_Reservation__Output>): grpc.ClientUnaryCall;
  SettleCredits(argument: _credit_SettleCreditsRequest, options: grpc.CallOptions, callback: grpc.requestCallback<_credit_Reservation__Output>): grpc.ClientUnaryCall;
  SettleCredits(argument: _credit_SettleCreditsRequest, callback: grpc.requestCallback<_credit_Reservation__Output>): grpc.ClientUnaryCall;
  settleCredits(argument: _credit_SettleCreditsRequest, metadata: grpc.Metadata, options: grpc.CallOptions, callback: grpc.requestCallback<_credit_Reservation__Output>): grpc.ClientUnaryCall;
  settleCredits(argument: _credit_SettleCreditsRequest, metadata: grpc.Metadata, callback: grpc.requestCallback<_credit_Reservation__Output>): grpc.ClientUnaryCall;
  settleCredits(argument: _credit_SettleCreditsRequest, options: grpc.CallOptions, callback: grpc.requestCallback<_credit_Reservation__Output>): grpc.ClientUnaryCall;
  settleCredits(argument: _credit_SettleCreditsRequest, callback: grpc.requestCallback<_credit_Reservation__Output>): grpc.ClientUnaryCall;
  
  UpdateReservation(argument: _credit_UpdateReservationRequest, metadata: grpc.Metadata, options: grpc.CallOptions, callback: grpc.requestCallback<_credit_Reservation__Output>): grpc.ClientUnaryCall;
  UpdateReservation(argument: _credit_UpdateReservationRequest, metadata: grpc.Metadata, callback: grpc.requestCallback<_credit_Reservation__Output>): grpc.ClientUnaryCall;
  UpdateReservation(argument: _credit_UpdateReservationRequest, options: grpc.CallOptions, callback: grpc.requestCallback<_credit_Reservation__Output>): grpc.ClientUnaryCall;
  UpdateReservation(argument: _credit_UpdateReservationRequest, callback: grpc.requestCallback<_credit_Reservation__Output>): grpc.ClientUnaryCall;
  updateReservation(argument: _credit_UpdateReservationRequest, metadata: grpc.Metadata, options: grpc.CallOptions, callback: grpc.requestCallback<_credit_Reservation__Output>): grpc.ClientUnaryCall;
  updateReservation(argument: _credit_UpdateReservationRequest, metadata: grpc.Metadata, callback: grpc.requestCallback<_credit_Reservation__Output>): grpc.ClientUnaryCall;
  updateReservation(argument: _credit_UpdateReservationRequest, options: grpc.CallOptions, callback: grpc.requestCallback<_credit_Reservation__Output>): grpc.ClientUnaryCall;
  updateReservation(argument: _credit_UpdateReservationRequest, callback: grpc.requestCallback<_credit_Reservation__Output>): grpc.ClientUnaryCall;
  
}

export interface CreditServiceHandlers extends grpc.UntypedServiceImplementation {
  GetBalance: grpc.handleUnaryCall<_credit_GetBalanceRequest__Output, _credit_Balance>;
  
  GetReservation: grpc.handleUnaryCall<_credit_GetReservationRequest__Output, _credit_Reservation>;
  
  ReleaseCredits: grpc.handleUnaryCall<_credit_ReleaseCreditsRequest__Output, _credit_Reservation>;
  
  ReserveCredits: grpc.handleUnaryCall<_credit_ReserveCreditsRequest__Output, _credit_Reservation>;
  
  SettleCredits: grpc.handleUnaryCall<_credit_SettleCreditsRequest__Output, _credit_Reservation>;
  
  UpdateReservation: grpc.handleUnaryCall<_credit_UpdateReservationRequest__Output, _credit_Reservation>;
  
}

export interface CreditServiceDefinition extends grpc.ServiceDefinition {
  GetBalance: MethodDefinition<_credit_GetBalanceRequest, _credit_Balance, _credit_GetBalanceRequest__Output, _credit_Balance__Output>
  GetReservation: MethodDefinition<_credit_GetReservationRequest, _credit_Reservation, _credit_GetReservationRequest__Output, _credit_Reservation__Output>
  ReleaseCredits: MethodDefinition<_credit_ReleaseCreditsRequest, _credit_Reservation, _credit_ReleaseCreditsRequest__Output, _credit_Reservation__Output>
  ReserveCredits: MethodDefinition<_credit_ReserveCreditsRequest, _credit_Reservation, _credit_ReserveCreditsRequest__Output, _credit_Reservation__Output>
  SettleCredits: MethodDefinition<_credit_SettleCreditsRequest, _credit_Reservation, _credit_SettleCreditsRequest__Output, _credit_Reservation__Output>
  UpdateReservation: MethodDefinition<_credit_UpdateReservationRequest, _credit_Reservation, _credit_UpdateReservationRequest__Output, _credit_Reservation__Output>
}
