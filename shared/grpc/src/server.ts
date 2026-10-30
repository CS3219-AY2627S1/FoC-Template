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
  const server = new Server();
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
