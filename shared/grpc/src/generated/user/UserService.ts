// Original file: ../../user-service/proto/user.proto

import type * as grpc from '@grpc/grpc-js'
import type { MethodDefinition } from '@grpc/proto-loader'
import type { GetPublicProfileRequest as _user_GetPublicProfileRequest, GetPublicProfileRequest__Output as _user_GetPublicProfileRequest__Output } from '../user/GetPublicProfileRequest';
import type { PublicProfile as _user_PublicProfile, PublicProfile__Output as _user_PublicProfile__Output } from '../user/PublicProfile';

export interface UserServiceClient extends grpc.Client {
  GetPublicProfile(argument: _user_GetPublicProfileRequest, metadata: grpc.Metadata, options: grpc.CallOptions, callback: grpc.requestCallback<_user_PublicProfile__Output>): grpc.ClientUnaryCall;
  GetPublicProfile(argument: _user_GetPublicProfileRequest, metadata: grpc.Metadata, callback: grpc.requestCallback<_user_PublicProfile__Output>): grpc.ClientUnaryCall;
  GetPublicProfile(argument: _user_GetPublicProfileRequest, options: grpc.CallOptions, callback: grpc.requestCallback<_user_PublicProfile__Output>): grpc.ClientUnaryCall;
  GetPublicProfile(argument: _user_GetPublicProfileRequest, callback: grpc.requestCallback<_user_PublicProfile__Output>): grpc.ClientUnaryCall;
  getPublicProfile(argument: _user_GetPublicProfileRequest, metadata: grpc.Metadata, options: grpc.CallOptions, callback: grpc.requestCallback<_user_PublicProfile__Output>): grpc.ClientUnaryCall;
  getPublicProfile(argument: _user_GetPublicProfileRequest, metadata: grpc.Metadata, callback: grpc.requestCallback<_user_PublicProfile__Output>): grpc.ClientUnaryCall;
  getPublicProfile(argument: _user_GetPublicProfileRequest, options: grpc.CallOptions, callback: grpc.requestCallback<_user_PublicProfile__Output>): grpc.ClientUnaryCall;
  getPublicProfile(argument: _user_GetPublicProfileRequest, callback: grpc.requestCallback<_user_PublicProfile__Output>): grpc.ClientUnaryCall;
  
}

export interface UserServiceHandlers extends grpc.UntypedServiceImplementation {
  GetPublicProfile: grpc.handleUnaryCall<_user_GetPublicProfileRequest__Output, _user_PublicProfile>;
  
}

export interface UserServiceDefinition extends grpc.ServiceDefinition {
  GetPublicProfile: MethodDefinition<_user_GetPublicProfileRequest, _user_PublicProfile, _user_GetPublicProfileRequest__Output, _user_PublicProfile__Output>
}
