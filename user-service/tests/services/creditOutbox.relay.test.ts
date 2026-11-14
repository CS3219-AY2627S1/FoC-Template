// AI Assistance Disclosure:
// Tool: Claude Code (claude-sonnet-5), date: 2026-10-23
// Scope: Generated unit tests for creditOutbox.relay.ts's classifyResponseStatus, the one pure,
//        no-I/O function the stage's own text calls out as separated "so it can be
//        unit-tested later" (instructions.md Stage 14c). Does not test deliverCreditAllocation,
//        runOutboxPass or startCreditOutboxRelay: all three make real outbound HTTP calls to
//        credit-service, and Stage 7's mocking policy does not authorize mocking that (or any
//        other) outbound HTTP dependency - only sendOtpEmail/nodemailer and the config module
//        (bootstrap tests only) are exempted from the "no mocking" rule. Flagged to the user
//        rather than adding an unapproved mock or a real stand-in HTTP server.
// Author review:
import { describe, expect, it } from 'vitest';
import { classifyResponseStatus } from '../../src/services/creditOutbox.relay.js';

describe('classifyResponseStatus', () => {
  it.each([200, 201, 204, 299])('sent for 2xx (%i)', (status) => {
    expect(classifyResponseStatus(status)).toBe('sent');
  });

  it('sent for 409 (already allocated)', () => {
    expect(classifyResponseStatus(409)).toBe('sent');
  });

  it.each([400, 401, 403, 404, 500])('dead immediately for %i', (status) => {
    expect(classifyResponseStatus(status)).toBe('dead');
  });

  it.each([408, 425, 429])('retry for %i', (status) => {
    expect(classifyResponseStatus(status)).toBe('retry');
  });

  it.each([502, 503, 504, 599])('retry for other 5xx (%i)', (status) => {
    expect(classifyResponseStatus(status)).toBe('retry');
  });

  it.each([301, 302, 304, 410, 418, 451])('dead for any other 3xx/4xx not explicitly listed (%i)', (status) => {
    expect(classifyResponseStatus(status)).toBe('dead');
  });
});
