// AI Assistance Disclosure:
// Tool: Claude Code (claude-sonnet-5), date: 2026-09-26
// 26/09/2026: Stage 7 - helpers around the mocked sendOtpEmail
// Author review:
// 2026-11-10: Stage 31e - added the same helpers for the mocked sendUnlockEmail (global mock
//   added in setupFiles.ts for Stage 31b), plus awaitLastUnlockEmail. triggerUnlockEmail
//   (auth.service.ts) calls `sendUnlockEmail(...).catch(() => {})` without awaiting it, so a
//   caller's own promise (e.g. a supertest response, or authService.login's rejection) can
//   resolve before the mocked send settles. Since the mock is invoked synchronously (the
//   `void sendUnlockEmail(...)` call itself runs before triggerUnlockEmail returns, well before
//   the HTTP response is written), its call and the Promise it returned are already recorded
//   in sendUnlockEmailMock.mock.results by the time the triggering request/call resolves;
//   awaitLastUnlockEmail just awaits that already-captured promise so a test can observe the
//   send's completion deterministically, with no change to production code or timing.
//   Governing decision: instructions.md Stage 31e ("tell me how you made that awaitable
//   without changing production behaviour").
//   No requirements, architecture, schema, or API decisions were made by the AI tool.
// Author review:
import { beforeEach, expect, vi } from 'vitest';
import { sendOtpEmail, sendUnlockEmail } from '../../src/services/email.service.js';

export const sendOtpEmailMock = vi.mocked(sendOtpEmail);
export const sendUnlockEmailMock = vi.mocked(sendUnlockEmail);

// Call from a describe block: clears recorded calls and restores the succeeding implementation.
export function resetEmailMock(): void {
  beforeEach(() => {
    sendOtpEmailMock.mockReset();
    sendOtpEmailMock.mockImplementation(async () => {});
    sendUnlockEmailMock.mockReset();
    sendUnlockEmailMock.mockImplementation(async () => {});
  });
}

export function unlockEmailCallsFor(to: string): { to: string; username: string; unlockUrl: string }[] {
  return sendUnlockEmailMock.mock.calls.map(([arg]) => arg).filter((arg) => arg.to === to);
}

// The unlock link most recently "emailed" to this address.
export function latestUnlockUrlFor(to: string): string {
  const calls = unlockEmailCallsFor(to);
  expect(calls.length, `no unlock email was sent to ${to}`).toBeGreaterThan(0);
  return calls[calls.length - 1]!.unlockUrl;
}

// Awaits the most recent (fire-and-forget) sendUnlockEmail call's own promise, so a test can
// observe the background send's completion deterministically. See the header comment above for
// why this is safe to read without changing production code: the mock call is already recorded
// by the time the triggering request/call has resolved.
export async function awaitLastUnlockEmail(): Promise<void> {
  const result = sendUnlockEmailMock.mock.results.at(-1);
  expect(result, 'sendUnlockEmail was not called').toBeDefined();
  if (result!.type === 'throw') throw result!.value;
  await result!.value;
}

export function failNextEmail(): void {
  sendOtpEmailMock.mockRejectedValueOnce(new Error('SMTP down'));
}

export function emailCallsFor(to: string): { to: string; otp: string; purpose: string }[] {
  return sendOtpEmailMock.mock.calls.map(([arg]) => arg).filter((arg) => arg.to === to);
}

// The plaintext OTP most recently "emailed" to this address.
export function latestOtpFor(to: string): string {
  const calls = emailCallsFor(to);
  expect(calls.length, `no OTP email was sent to ${to}`).toBeGreaterThan(0);
  return calls[calls.length - 1]!.otp;
}

// Any 6-digit code that differs from the real one.
export function wrongOtp(real: string): string {
  return real === '000000' ? '111111' : '000000';
}
