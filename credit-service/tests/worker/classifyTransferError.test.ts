// AI Assistance Disclosure:
// Tool: Claude Code (model: claude-opus-5), date: 2026-10-22
//  2026-10-22: Credit transfer consumer - the classification table, asserted case by
//    case against the contract agreed with order-service on 2026-10-20. Pure, so no
//    database or broker is needed.
//    No requirements, architecture, schema, or API decisions were made by the AI tool.
//    Author review: Reviewed and verified by Koh Wee Jean, 2026-11-10.

import { describe, expect, it } from 'vitest';
import { classifyTransferError } from '../../src/worker/classifyTransferError.js';
import { AppError } from '../../src/utils/AppError.js';

describe('the transfer error classification table', () => {
  // Each row is the contract, verbatim. If one of these flips, the worker either
  // retries something that can never succeed or dead-letters a job that was fine.
  it.each([
    ['ALREADY_TRANSFERRED', 409, 'success'],
    ['RESERVATION_NOT_FOUND', 404, 'permanent'],
    ['COURIER_NOT_FOUND', 404, 'permanent'],
    ['BALANCE_NOT_FOUND', 404, 'permanent'],
    ['ALREADY_RELEASED', 409, 'permanent'],
  ] as const)('classifies %s (%i) as %s', (code, status, expected) => {
    expect(classifyTransferError(new AppError(status, 'x', code))).toBe(expected);
  });

  it('is the only outcome that counts as success', () => {
    // Guards the pairing the whole design rests on: ALREADY_TRANSFERRED means the work
    // is done, ALREADY_RELEASED means it never can be. They are both 409s, so a worker
    // reading the status alone could not tell them apart.
    const transferred = new AppError(409, 'x', 'ALREADY_TRANSFERRED');
    const released = new AppError(409, 'x', 'ALREADY_RELEASED');
    expect(classifyTransferError(transferred)).toBe('success');
    expect(classifyTransferError(released)).toBe('permanent');
  });

  describe('codes not named in the table', () => {
    it('dead-letters an unknown 4xx rather than retrying it', () => {
      expect(classifyTransferError(new AppError(400, 'x', 'INVALID_REQUEST_BODY'))).toBe(
        'permanent',
      );
      expect(classifyTransferError(new AppError(422, 'x', 'SOMETHING_NEW'))).toBe('permanent');
      expect(classifyTransferError(new AppError(403, 'x', 'FORBIDDEN'))).toBe('permanent');
    });

    it('retries a 5xx, which is this service failing and may be transient', () => {
      expect(classifyTransferError(new AppError(500, 'x', 'INTERNAL_ERROR'))).toBe('retry');
      expect(
        classifyTransferError(new AppError(500, 'x', 'BALANCE_INVARIANT_VIOLATION')),
      ).toBe('retry');
      expect(classifyTransferError(new AppError(503, 'x', 'IDENTITY_PROVIDER_UNAVAILABLE'))).toBe(
        'retry',
      );
    });

    it('retries anything that is not an AppError', () => {
      // A pool timeout, a connection reset, a Postgres error that escaped the service.
      expect(classifyTransferError(new Error('connection terminated unexpectedly'))).toBe(
        'retry',
      );
      expect(classifyTransferError({ code: '57P01' })).toBe('retry');
      expect(classifyTransferError(undefined)).toBe('retry');
    });
  });
});
