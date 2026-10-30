// AI Assistance Disclosure:
// Tool: OpenAI Codex (model: GPT-6), dates: 2026-10-20–2026-10-21 (Asia/Singapore).
// Scope: Added human-finalized credit wrappers and bounded application retries with one overall deadline and configurable backoff.
// Author review: I reviewed the shared client retry implementation.
// Prompts and key responses: ../../../credit-service/ai/usage-log.md, entries 010–012, 016, 021, 026–027 and 029.

import {
  credentials,
  Metadata,
  status,
  type CallOptions,
  type ChannelCredentials,
  type ClientUnaryCall,
  type requestCallback,
} from '@grpc/grpc-js';
import { UserService, OrderService, CreditService, SupplierService } from './contracts';
import type { GetPublicProfileRequest } from './generated/user/GetPublicProfileRequest';
import type { PublicProfile__Output as PublicProfile } from './generated/user/PublicProfile';
import type { GetOrderRequest } from './generated/order/GetOrderRequest';
import type { Order__Output as Order } from './generated/order/Order';
import type { GetBalanceRequest } from './generated/credit/GetBalanceRequest';
import type { Balance__Output as Balance } from './generated/credit/Balance';
import type { ReserveCreditsRequest } from './generated/credit/ReserveCreditsRequest';
import type { Reservation__Output as Reservation } from './generated/credit/Reservation';
import type { ReleaseCreditsRequest } from './generated/credit/ReleaseCreditsRequest';
import type { SettleCreditsRequest } from './generated/credit/SettleCreditsRequest';
import type { UpdateReservationRequest } from './generated/credit/UpdateReservationRequest';
import type { GetReservationRequest } from './generated/credit/GetReservationRequest';
import type { GetSupplierRequest } from './generated/supplier/GetSupplierRequest';
import type { Supplier__Output as Supplier } from './generated/supplier/Supplier';
import type { IsOpenRequest } from './generated/supplier/IsOpenRequest';
import type { IsOpenResponse__Output as IsOpenResponse } from './generated/supplier/IsOpenResponse';

// These retry fields apply only to the Credit client. Attempts include the first call.
export interface CreditRetryOptions {
  maxAttempts?: number;
  initialDelayMs?: number;
  backoffMultiplier?: number;
  maxDelayMs?: number;
}

export interface ClientConfig extends CreditRetryOptions {
  timeoutMs?: number;
  credentials?: ChannelCredentials;
}

export interface RpcOptions extends CreditRetryOptions {
  timeoutMs?: number;
  // Supply the incoming call's deadline to keep downstream calls within it.
  deadline?: Date | number;
  metadata?: Metadata;
}

function positiveTimeout(timeoutMs: number): number {
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0) {
    throw new RangeError('timeoutMs must be a positive safe integer');
  }
  return timeoutMs;
}

function callOptions(defaultTimeout: number, options: RpcOptions): CallOptions {
  const timeout = positiveTimeout(options.timeoutMs ?? defaultTimeout);
  const localDeadline = Date.now() + timeout;
  const upstreamDeadline =
    options.deadline instanceof Date ? options.deadline.getTime() : (options.deadline ?? Infinity);
  if (Number.isNaN(upstreamDeadline)) {
    throw new RangeError('deadline must be a valid Date or timestamp');
  }
  return { deadline: Math.min(localDeadline, upstreamDeadline) };
}

function unary<Response>(
  invoke: (callback: requestCallback<Response>) => ClientUnaryCall,
): Promise<Response> {
  return new Promise((resolve, reject) => {
    invoke((error, response) => {
      if (error) reject(error);
      else if (response === undefined) reject(new Error('gRPC returned no response'));
      else resolve(response);
    });
  });
}

const creditRetryDefaults: Required<CreditRetryOptions> = {
  maxAttempts: 3,
  initialDelayMs: 50,
  backoffMultiplier: 2,
  maxDelayMs: 500,
};

function creditRetryOptions(
  defaults: Required<CreditRetryOptions>,
  overrides: CreditRetryOptions,
): Required<CreditRetryOptions> {
  const settings = {
    maxAttempts: overrides.maxAttempts ?? defaults.maxAttempts,
    initialDelayMs: overrides.initialDelayMs ?? defaults.initialDelayMs,
    backoffMultiplier: overrides.backoffMultiplier ?? defaults.backoffMultiplier,
    maxDelayMs: overrides.maxDelayMs ?? defaults.maxDelayMs,
  };
  if (!Number.isSafeInteger(settings.maxAttempts) || settings.maxAttempts < 1) {
    throw new RangeError('maxAttempts must be a positive safe integer');
  }
  for (const field of ['initialDelayMs', 'maxDelayMs'] as const) {
    if (!Number.isSafeInteger(settings[field]) || settings[field] < 0 || settings[field] > 2147483647) {
      throw new RangeError(`${field} must be an integer between 0 and 2147483647`);
    }
  }
  if (!Number.isFinite(settings.backoffMultiplier) || settings.backoffMultiplier < 1) {
    throw new RangeError('backoffMultiplier must be finite and at least 1');
  }
  return settings;
}

function isRetryableCreditError(error: unknown): boolean {
  if (error === null || typeof error !== 'object' || !('code' in error)) return false;
  return error.code === status.UNAVAILABLE
    || error.code === status.ABORTED
    || error.code === status.DEADLINE_EXCEEDED;
}

async function creditUnary<Response>(
  defaultTimeout: number,
  defaults: Required<CreditRetryOptions>,
  options: RpcOptions,
  invoke: (callOptions: CallOptions, callback: requestCallback<Response>) => ClientUnaryCall,
): Promise<Response> {
  const settings = creditRetryOptions(defaults, options);
  // Resolve this once: every attempt shares the same absolute deadline.
  const attemptOptions = callOptions(defaultTimeout, options);
  const deadline = attemptOptions.deadline as number;
  if (Date.now() >= deadline) {
    throw Object.assign(new Error('Deadline exceeded before Credit call started'), {
      code: status.DEADLINE_EXCEEDED,
      details: 'Deadline exceeded before Credit call started',
      metadata: new Metadata(),
    });
  }
  let baseDelay = Math.min(settings.initialDelayMs, settings.maxDelayMs);
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await unary<Response>((callback) => invoke(attemptOptions, callback));
    } catch (error) {
      if (attempt >= settings.maxAttempts || !isRetryableCreditError(error)) throw error;
      const delay = baseDelay / 2 + Math.random() * baseDelay / 2;
      if (delay >= deadline - Date.now()) throw error;
      await new Promise<void>((resolve) => setTimeout(resolve, delay));
      // Timers can run late; do not start another attempt after the budget expires.
      if (Date.now() >= deadline) throw error;
      baseDelay = Math.min(baseDelay * settings.backoffMultiplier, settings.maxDelayMs);
    }
  }
}

export function createUserClient(target: string, config: ClientConfig = {}) {
  const timeoutMs = positiveTimeout(config.timeoutMs ?? 3000);
  const client = new UserService(target, config.credentials ?? credentials.createInsecure());
  return {
    getPublicProfile(
      request: GetPublicProfileRequest,
      options: RpcOptions = {},
    ): Promise<PublicProfile> {
      return unary((callback) =>
        client.getPublicProfile(
          request,
          options.metadata ?? new Metadata(),
          callOptions(timeoutMs, options),
          callback,
        ),
      );
    },
    close(): void {
      client.close();
    },
  };
}

export function createOrderClient(target: string, config: ClientConfig = {}) {
  const timeoutMs = positiveTimeout(config.timeoutMs ?? 3000);
  const client = new OrderService(target, config.credentials ?? credentials.createInsecure());
  return {
    getOrder(request: GetOrderRequest, options: RpcOptions = {}): Promise<Order> {
      return unary((callback) =>
        client.getOrder(
          request,
          options.metadata ?? new Metadata(),
          callOptions(timeoutMs, options),
          callback,
        ),
      );
    },
    close(): void {
      client.close();
    },
  };
}

export function createCreditClient(target: string, config: ClientConfig = {}) {
  const timeoutMs = positiveTimeout(config.timeoutMs ?? 1300);
  const retries = creditRetryOptions(creditRetryDefaults, config);
  const client = new CreditService(target, config.credentials ?? credentials.createInsecure());
  return {
    getBalance(request: GetBalanceRequest, options: RpcOptions = {}): Promise<Balance> {
      return creditUnary(timeoutMs, retries, options, (attemptOptions, callback) =>
        client.getBalance(
          request,
          options.metadata ?? new Metadata(),
          attemptOptions,
          callback,
        ),
      );
    },
    reserveCredits(request: ReserveCreditsRequest, options: RpcOptions = {}): Promise<Reservation> {
      return creditUnary(timeoutMs, retries, options, (attemptOptions, callback) =>
        client.reserveCredits(
          request,
          options.metadata ?? new Metadata(),
          attemptOptions,
          callback,
        ),
      );
    },
    updateReservation(request: UpdateReservationRequest, options: RpcOptions = {}): Promise<Reservation> {
      return creditUnary(timeoutMs, retries, options, (attemptOptions, callback) =>
        client.updateReservation(
          request,
          options.metadata ?? new Metadata(),
          attemptOptions,
          callback,
        ),
      );
    },
    releaseCredits(request: ReleaseCreditsRequest, options: RpcOptions = {}): Promise<Reservation> {
      return creditUnary(timeoutMs, retries, options, (attemptOptions, callback) =>
        client.releaseCredits(
          request,
          options.metadata ?? new Metadata(),
          attemptOptions,
          callback,
        ),
      );
    },
    settleCredits(request: SettleCreditsRequest, options: RpcOptions = {}): Promise<Reservation> {
      return creditUnary(timeoutMs, retries, options, (attemptOptions, callback) =>
        client.settleCredits(
          request,
          options.metadata ?? new Metadata(),
          attemptOptions,
          callback,
        ),
      );
    },
    getReservation(request: GetReservationRequest, options: RpcOptions = {}): Promise<Reservation> {
      return creditUnary(timeoutMs, retries, options, (attemptOptions, callback) =>
        client.getReservation(
          request,
          options.metadata ?? new Metadata(),
          attemptOptions,
          callback,
        ),
      );
    },
    close(): void {
      client.close();
    },
  };
}

export function createSupplierClient(target: string, config: ClientConfig = {}) {
  const timeoutMs = positiveTimeout(config.timeoutMs ?? 3000);
  const client = new SupplierService(target, config.credentials ?? credentials.createInsecure());
  return {
    getSupplier(request: GetSupplierRequest, options: RpcOptions = {}): Promise<Supplier> {
      return unary((callback) =>
        client.getSupplier(
          request,
          options.metadata ?? new Metadata(),
          callOptions(timeoutMs, options),
          callback,
        ),
      );
    },
    isOpen(request: IsOpenRequest, options: RpcOptions = {}): Promise<IsOpenResponse> {
      return unary((callback) =>
        client.isOpen(
          request,
          options.metadata ?? new Metadata(),
          callOptions(timeoutMs, options),
          callback,
        ),
      );
    },
    close(): void {
      client.close();
    },
  };
}

export interface PeerAddresses {
  user: string;
  order: string;
  credit: string;
  supplier: string;
}

export function createPeerClients(addresses: PeerAddresses, config: ClientConfig = {}) {
  const user = createUserClient(addresses.user, config);
  const order = createOrderClient(addresses.order, config);
  const credit = createCreditClient(addresses.credit, config);
  const supplier = createSupplierClient(addresses.supplier, config);
  return {
    user,
    order,
    credit,
    supplier,
    close(): void {
      user.close();
      order.close();
      credit.close();
      supplier.close();
    },
  };
}
