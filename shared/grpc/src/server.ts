// AI Assistance Disclosure: Claude Code (Claude Opus), 2026-11-06.
// Scope: server connection age, so clients find pods added by autoscaling.
// Details: ai/usage-log.md (repo root), entry 005.

import {
  Server,
  ServerCredentials,
  status,
  type ServiceDefinition,
  type UntypedServiceImplementation,
  type handleUnaryCall,
} from '@grpc/grpc-js';

export function unimplemented<Request, Response>(
  method: string,
): handleUnaryCall<Request, Response> {
  return (_call, callback) => {
    callback({ code: status.UNIMPLEMENTED, details: method + ' is not implemented yet' });
  };
}

export function createServer(
  definition: ServiceDefinition,
  handlers: UntypedServiceImplementation,
): Server {
  // Close connections after 2 min so clients reconnect and re-resolve DNS,
  // which is how they find pods added by autoscaling.
  const server = new Server({
    'grpc.max_connection_age_ms': 120_000,
    'grpc.max_connection_age_grace_ms': 30_000, // let in-flight calls finish first
  });
  server.addService(definition, handlers);
  return server;
}

export function startServer(
  server: Server,
  port: number,
  host = '0.0.0.0',
  credentials = ServerCredentials.createInsecure(),
): Promise<number> {
  return new Promise((resolve, reject) => {
    server.bindAsync(host + ':' + port, credentials, (error, boundPort) => {
      if (error) {
        server.forceShutdown();
        reject(error);
      } else {
        resolve(boundPort);
      }
    });
  });
}

export function stopServer(server: Server, graceMs = 5000): Promise<void> {
  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      server.forceShutdown();
      resolve();
    }, graceMs);
    server.tryShutdown(() => {
      clearTimeout(timeout);
      resolve();
    });
  });
}
