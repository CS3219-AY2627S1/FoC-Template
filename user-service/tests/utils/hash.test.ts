// AI Assistance Disclosure:
// Tool: Claude Code (claude-sonnet-5), date: 2026-09-26
// 26/09/2026: Stage 7 - unit tests for hash.ts
// Author review:
import { describe, expect, it } from 'vitest';
import { hashesMatch, sha256 } from '../../src/utils/hash.js';

describe('sha256', () => {
  it('matches the known SHA-256 vector for "abc"', () => {
    expect(sha256('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });

  it('returns 64 lowercase hex characters', () => {
    expect(sha256('anything')).toMatch(/^[0-9a-f]{64}$/);
  });

  it('is deterministic and input-sensitive', () => {
    expect(sha256('a')).toBe(sha256('a'));
    expect(sha256('a')).not.toBe(sha256('b'));
  });
});

describe('hashesMatch', () => {
  it('returns true for identical digests', () => {
    expect(hashesMatch(sha256('x'), sha256('x'))).toBe(true);
  });

  it('returns false for different digests', () => {
    expect(hashesMatch(sha256('x'), sha256('y'))).toBe(false);
  });

  it('returns false, without throwing, when lengths differ', () => {
    expect(hashesMatch(sha256('x'), 'abcd')).toBe(false);
    expect(hashesMatch('', sha256('x'))).toBe(false);
  });

  it('does not throw on non-hex input', () => {
    expect(() => hashesMatch('zzzz', 'zzzz')).not.toThrow();
  });
});
