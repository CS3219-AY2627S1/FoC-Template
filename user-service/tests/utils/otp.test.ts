// AI Assistance Disclosure:
// Tool: Claude Code (claude-sonnet-5), date: 2026-09-26
// 26/09/2026: Stage 7 - unit tests for otp.ts (generateOtp)
// Author review:
import { describe, expect, it, vi } from 'vitest';

const { randomIntMock } = vi.hoisted(() => ({ randomIntMock: vi.fn() }));

vi.mock('node:crypto', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:crypto')>();
  randomIntMock.mockImplementation(actual.randomInt as (...a: unknown[]) => number);
  return { ...actual, randomInt: randomIntMock };
});

import { generateOtp } from '../../src/utils/otp.js';

describe('generateOtp', () => {
  it('always returns exactly 6 digits (10,000 iterations)', () => {
    for (let i = 0; i < 10_000; i++) {
      expect(generateOtp()).toMatch(/^\d{6}$/);
    }
  });

  it('asks crypto.randomInt for a value in [0, 1_000_000)', () => {
    randomIntMock.mockClear();
    generateOtp();
    expect(randomIntMock).toHaveBeenCalledWith(0, 1_000_000);
  });

  it('zero-pads small values to 6 digits', () => {
    randomIntMock.mockReturnValueOnce(42);
    expect(generateOtp()).toBe('000042');
    randomIntMock.mockReturnValueOnce(0);
    expect(generateOtp()).toBe('000000');
    randomIntMock.mockReturnValueOnce(999_999);
    expect(generateOtp()).toBe('999999');
  });
});
