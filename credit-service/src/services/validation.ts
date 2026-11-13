// AI Assistance Disclosure:
// Tool: OpenAI Codex (model: GPT-6), dates: 2026-10-20–2026-10-21 (Asia/Singapore).
// Scope: Implemented the human-specified identifier and positive SQL-integer validation rules for core credit operations.
// Refactor: Moved/imports updated for the human-specified src layout (entry 024).
// Author review: I reviewed the functions and their validation logic.
// Prompts and key responses: ../../ai/usage-log.md, entries 005–025.

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

export function assertIdentifier(value: unknown, field: string): asserts value is string {
  if (typeof value !== 'string' || value.length === 0
    || value !== value.trim() || [...value].length > 128 || /\p{Cc}/u.test(value)) {
    throw new ValidationError(`Invalid ${field}`);
  }
}

export function assertUserId(userId: unknown): asserts userId is string {
  assertIdentifier(userId, 'userId');
}

export function assertOrderId(orderId: unknown): asserts orderId is string {
  assertIdentifier(orderId, 'orderId');
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(orderId)) {
    throw new ValidationError('orderId must be a lowercase hyphenated UUID');
  }
}

export function assertPositiveInteger(value: unknown, field: string): asserts value is number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1 || value > 2147483647) {
    throw new ValidationError(`${field} must be a positive PostgreSQL integer`);
  }
}
