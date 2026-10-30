import type * as grpc from '@grpc/grpc-js';
import type { MessageTypeDefinition } from '@grpc/proto-loader';

import type { GetPublicProfileRequest as _user_GetPublicProfileRequest, GetPublicProfileRequest__Output as _user_GetPublicProfileRequest__Output } from './user/GetPublicProfileRequest';
import type { PublicProfile as _user_PublicProfile, PublicProfile__Output as _user_PublicProfile__Output } from './user/PublicProfile';
import type { UserServiceClient as _user_UserServiceClient, UserServiceDefinition as _user_UserServiceDefinition } from './user/UserService';

type SubtypeConstructor<Constructor extends new (...args: any) => any, Subtype> = {
  new(...args: ConstructorParameters<Constructor>): Subtype;
};

export interface ProtoGrpcType {
  user: {
    GetPublicProfileRequest: MessageTypeDefinition<_user_GetPublicProfileRequest, _user_GetPublicProfileRequest__Output>
    PublicProfile: MessageTypeDefinition<_user_PublicProfile, _user_PublicProfile__Output>
    UserService: SubtypeConstructor<typeof grpc.Client, _user_UserServiceClient> & { service: _user_UserServiceDefinition }
  }
}

