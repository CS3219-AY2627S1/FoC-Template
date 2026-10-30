// AI Assistance Disclosure: ChatGPT (Codex), 2026-10-22.
// Scope: Merge whitespace cleanup only; teammate implementation retained.
// Human review pending; see order-service/usage-log.md (repository root).
/*
AI Declaration: Prompted by ChatGPT (Codex) and reviewed/edited by @sunpterodactyl
@sunpterodactyl
Prompt: ok create invalidsuppliererror in order-service/grpc/src/grpc/error.ts

Reason: Custom error class to handle my invalid supplier id parse case. Upgrading from returning
undefined to throwing an error for better error handling in the order service. It also bypasses
current error handling to send server side error for all errors from gRPC

Tbh this is just a fallback for my supplier zod schema i don't think its really necessary
*/

export class InvalidSupplierError extends Error {
  constructor(message = 'Invalid supplier request') {
    super(message);
    this.name = 'InvalidSupplierError';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}
