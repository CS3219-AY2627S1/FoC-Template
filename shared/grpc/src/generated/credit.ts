import type * as grpc from '@grpc/grpc-js';
import type { EnumTypeDefinition, MessageTypeDefinition } from '@grpc/proto-loader';

import type { Balance as _credit_Balance, Balance__Output as _credit_Balance__Output } from './credit/Balance';
import type { CreditServiceClient as _credit_CreditServiceClient, CreditServiceDefinition as _credit_CreditServiceDefinition } from './credit/CreditService';
import type { GetBalanceRequest as _credit_GetBalanceRequest, GetBalanceRequest__Output as _credit_GetBalanceRequest__Output } from './credit/GetBalanceRequest';
import type { GetReservationRequest as _credit_GetReservationRequest, GetReservationRequest__Output as _credit_GetReservationRequest__Output } from './credit/GetReservationRequest';
import type { ReleaseCreditsRequest as _credit_ReleaseCreditsRequest, ReleaseCreditsRequest__Output as _credit_ReleaseCreditsRequest__Output } from './credit/ReleaseCreditsRequest';
import type { Reservation as _credit_Reservation, Reservation__Output as _credit_Reservation__Output } from './credit/Reservation';
import type { ReserveCreditsRequest as _credit_ReserveCreditsRequest, ReserveCreditsRequest__Output as _credit_ReserveCreditsRequest__Output } from './credit/ReserveCreditsRequest';
import type { SettleCreditsRequest as _credit_SettleCreditsRequest, SettleCreditsRequest__Output as _credit_SettleCreditsRequest__Output } from './credit/SettleCreditsRequest';
import type { UpdateReservationRequest as _credit_UpdateReservationRequest, UpdateReservationRequest__Output as _credit_UpdateReservationRequest__Output } from './credit/UpdateReservationRequest';

type SubtypeConstructor<Constructor extends new (...args: any) => any, Subtype> = {
  new(...args: ConstructorParameters<Constructor>): Subtype;
};

export interface ProtoGrpcType {
  credit: {
    Balance: MessageTypeDefinition<_credit_Balance, _credit_Balance__Output>
    CreditService: SubtypeConstructor<typeof grpc.Client, _credit_CreditServiceClient> & { service: _credit_CreditServiceDefinition }
    GetBalanceRequest: MessageTypeDefinition<_credit_GetBalanceRequest, _credit_GetBalanceRequest__Output>
    GetReservationRequest: MessageTypeDefinition<_credit_GetReservationRequest, _credit_GetReservationRequest__Output>
    ReleaseCreditsRequest: MessageTypeDefinition<_credit_ReleaseCreditsRequest, _credit_ReleaseCreditsRequest__Output>
    Reservation: MessageTypeDefinition<_credit_Reservation, _credit_Reservation__Output>
    ReservationStatus: EnumTypeDefinition
    ReserveCreditsRequest: MessageTypeDefinition<_credit_ReserveCreditsRequest, _credit_ReserveCreditsRequest__Output>
    SettleCreditsRequest: MessageTypeDefinition<_credit_SettleCreditsRequest, _credit_SettleCreditsRequest__Output>
    UpdateReservationRequest: MessageTypeDefinition<_credit_UpdateReservationRequest, _credit_UpdateReservationRequest__Output>
  }
}

