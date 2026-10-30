// AI Assistance Disclosure:
// Tool: OpenAI Codex (model: GPT-6), dates: 2026-10-20–2026-10-21 (Asia/Singapore).
// Scope: Implemented the human-finalized six order-only RPC handlers, service-token authorization, and business-error metadata.
// Author review: I reviewed that all the required authentication paths are present, and that only Order Service is allowed to call the credit RPCs via grpc.
// Prompts and key responses: ../../ai/usage-log.md, entries 005–026.

import { CreditService as Contract, createServer, type CreditServiceHandlers } from '@foc/grpc';
import { status, type handleUnaryCall } from '@grpc/grpc-js';
import type { CreditService } from '../services/CreditService';
import { AuthenticationError, serviceIdentityVerifier } from './auth';
import { grpcError } from './errors';

export function createGrpcServer(service: CreditService, tokens: Readonly<Record<string, string>>) {
  const identify = serviceIdentityVerifier(tokens);
  function handler<Request, Response>(invoke: (request: Request) => Promise<Response>): handleUnaryCall<Request, Response> {
    return async (call, callback) => {
      try {
        const values = call.metadata.get('x-credit-service-token');
        const identity = identify(values.length === 1 ? values[0] : undefined);
        if (identity !== 'order-service') {
          callback({ code: status.PERMISSION_DENIED, details: 'Service is not allowed to call credit RPCs' });
          return;
        }
        callback(null, await invoke(call.request));
      } catch (error) {
        if (error instanceof AuthenticationError) {
          callback({ code: status.UNAUTHENTICATED, details: error.message });
        } else {
          callback(grpcError(error));
        }
      }
    };
  }
  const handlers: CreditServiceHandlers = {
    GetBalance: handler((request) => service.getBalance(request)),
    ReserveCredits: handler((request) => service.reserveCredits(request)),
    UpdateReservation: handler((request) => service.updateReservation(request)),
    ReleaseCredits: handler((request) => service.releaseCredits(request)),
    SettleCredits: handler((request) => service.settleCredits(request)),
    GetReservation: handler((request) => service.getReservation(request)),
  };
  return createServer(Contract.service, handlers);
}
