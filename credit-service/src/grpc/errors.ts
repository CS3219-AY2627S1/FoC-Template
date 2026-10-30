// AI Assistance Disclosure:
// Tool: OpenAI Codex (model: GPT-6), dates: 2026-10-20–2026-10-21 (Asia/Singapore).
// Scope: Mapped the human-specified business/transient error categories to gRPC codes and reason metadata.
// Author review: I reviewed that all errors are mapped correctly, and have their own paths.
// Prompts and key responses: ../../ai/usage-log.md, entries 005–025 (prior scopes retained).

import { Metadata, status } from '@grpc/grpc-js';
import { CreditOperationError } from '../services/CreditService';
import { ValidationError } from '../services/validation';

export function grpcError(error: unknown): { code: status; details: string; metadata: Metadata } {
  let code = status.INTERNAL;
  let details = 'Internal credit-service error';
  const metadata = new Metadata();
  if (error instanceof CreditOperationError) {
    code = status[error.code];
    details = error.message;
    if (error.reason) metadata.set('x-credit-error-reason', error.reason);
  } else if (error instanceof ValidationError) {
    code = status.INVALID_ARGUMENT;
    details = error.message;
  } else {
    const errorCode = (error as { code?: unknown } | null)?.code;
    if (typeof errorCode === 'string') {
      if (['40001', '40P01', '55P03'].includes(errorCode)) {
        code = status.ABORTED;
        details = 'Credit transaction could not complete; retry the identical request';
      } else if (/^08/.test(errorCode)
        || ['57P01', '57P02', '57P03', 'ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT', 'EPIPE', 'ENOTFOUND'].includes(errorCode)) {
        code = status.UNAVAILABLE;
        details = 'Credit database is unavailable';
      }
    }
    // pg/pg-pool also emit these connection failures without a code.
    if (error instanceof Error && [
      'timeout exceeded when trying to connect',
      'Connection terminated due to connection timeout',
      'Connection terminated unexpectedly',
    ].includes(error.message)) {
      code = status.UNAVAILABLE;
      details = 'Credit database is unavailable';
    }
  }
  if (code === status.INTERNAL) console.error('Unexpected credit-service error', error);
  return { code, details, metadata };
}
