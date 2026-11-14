// AI Assistance Disclosure:
// Tool: Claude Code (model: claude-opus-5), date: 2026-10-22
//  2026-10-22: Credit transfer consumer - the Redis connection for the BullMQ worker.
//    An explicitly constructed ioredis client rather than plain connection options:
//    BullMQ 6 treats ioredis as an optional peer and cannot load it itself under
//    native ESM ("BullMQ could not load the optional 'ioredis' package"), which is
//    what this service is. The reconnect options implement the team's requirement
//    that the worker survive the broker being unavailable (2026-10-22).
//    No requirements, architecture, schema, or API decisions were made by the AI tool.
//    Author review: Reviewed and verified by Koh Wee Jean, 2026-11-10.
//  2026-11-06: ECS Fargate migration - optional TLS, per George's ECS Fargate plan, Phase 1
//    item 5. Tool: Claude Code (model: claude-opus-5-5). No requirements, architecture, schema,
//    or API decisions were made by the AI tool.
//    Author review: Reviewed and verified by Koh Wee Jean, 2026-11-10.

import { Redis, type RedisOptions } from 'ioredis';

/**
 * Connection options for the transfer worker.
 *
 * Exported separately from the client so they can be asserted without opening a
 * socket. Each of the three is deliberate; the sibling workers set none of them and
 * rely on ioredis defaults plus `restart: unless-stopped`, which means Docker restarts
 * a crashed container rather than the process staying up through an outage.
 */
export const redisOptions: RedisOptions = {
  // Required by BullMQ for a Worker. Its fetch is a blocking command, and with a
  // finite retry limit the worker stops consuming after a brief outage while still
  // looking alive — deaf rather than dead, which is worse.
  maxRetriesPerRequest: null,

  // Reconnect forever, backing off to a 10 s ceiling. ioredis's default stops
  // reconnecting in some failure modes; this one never does, so a broker that returns
  // after an hour is picked up with no operator action.
  retryStrategy: (times: number) => Math.min(times * 500, 10_000),

  // Commands issued while the socket is down wait for reconnection rather than being
  // rejected outright.
  enableOfflineQueue: true,
};

/**
 * One ioredis client for the worker, with connection-level logging.
 *
 * The logging is not decoration: `removeOnComplete: true` on the producer's side means
 * a successful job leaves no trace in Redis, so the log is the only place the
 * workflow — including a broker outage and its recovery — can be watched during a demo.
 */
export function createRedisConnection(
  host: string,
  port: number,
  tls = false,
  log: (message: string) => void = console.log,
  logError: (message: string) => void = console.error,
): Redis {
  // `tls: {}` keeps Node's certificate checks on.
  const connection = new Redis({ ...redisOptions, host, port, ...(tls ? { tls: {} } : {}) });

  connection.on('ready', () => log(`redis ${host}:${port} ready`));
  connection.on('reconnecting', (delay: number) =>
    log(`redis ${host}:${port} unavailable; reconnecting in ${delay}ms`),
  );
  connection.on('end', () => logError(`redis ${host}:${port} connection closed`));
  // Without a listener an ioredis 'error' is an unhandled event and takes the process
  // down — the opposite of surviving the broker being unavailable.
  connection.on('error', (error: Error) =>
    logError(`redis ${host}:${port} error: ${error.message}`),
  );

  return connection;
}
