import path from 'node:path';
import {
  Server,
  ServerCredentials,
  loadPackageDefinition,
  status,
  type ServerUnaryCall,
  type sendUnaryData,
  type UntypedServiceImplementation,
} from '@grpc/grpc-js';
import { loadSync } from '@grpc/proto-loader';
import * as userService from '../services/userService';

const PROTO_PATH = path.resolve(__dirname, '../../proto/user.proto');

const packageDefinition = loadSync(PROTO_PATH, {
  keepCase: false,
  longs: String,
  enums: String,
  defaults: true,
  oneofs: true,
});

const proto = loadPackageDefinition(packageDefinition) as any;

// Message shapes from user.proto (proto-loader camelCases the field names).
type GetPublicProfileRequest = { userId: string };
type PublicProfile = { userId: string; username: string; firstName: string; lastName: string };

const userServiceImpl: UntypedServiceImplementation = {
  // F2.6 — other services fetch a user's public profile by ID.
  async getPublicProfile(
    call: ServerUnaryCall<GetPublicProfileRequest, PublicProfile>,
    callback: sendUnaryData<PublicProfile>,
  ): Promise<void> {
    const { userId } = call.request;
    if (!userId) {
      callback({ code: status.INVALID_ARGUMENT, details: 'user_id is required' });
      return;
    }

    // gRPC has no default error handler: an uncaught throw would leave the
    // caller hanging until its deadline, so map it to INTERNAL explicitly.
    try {
      const user = await userService.getPublicProfile(userId);
      if (!user) {
        callback({ code: status.NOT_FOUND, details: 'User not found' });
        return;
      }
      callback(null, {
        userId: user.id,
        username: user.username,
        firstName: user.firstName,
        lastName: user.lastName,
      });
    } catch (err) {
      console.error('GetPublicProfile failed:', err);
      callback({ code: status.INTERNAL, details: 'Internal error' });
    }
  },
};

export function createGrpcServer(): Server {
  const server = new Server();
  server.addService(proto.user.UserService.service, userServiceImpl);
  return server;
}

export function startGrpcServer(port: number): Promise<Server> {
  const server = createGrpcServer();
  return new Promise((resolve, reject) => {
    // TODO(prod): no TLS here, add encryption before cloud deployment.
    server.bindAsync(`0.0.0.0:${port}`, ServerCredentials.createInsecure(), (err) => {
      if (err) return reject(err);
      resolve(server);
    });
  });
}
