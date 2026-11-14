// AI Assistance Disclosure:
// Tool: Claude Code (claude-sonnet-5), date: 2026-11-04
// 2026-11-04: Stage 20 - unit tests for maskEmail.ts, extracted from email.service.ts.
//   Governing decision: instructions.md Stage 20 (mask format table).
//   No requirements, architecture, schema, or API decisions were made by the AI tool.
// Author review:
import { describe, expect, it } from 'vitest';
import { maskEmail } from '../../src/utils/maskEmail.js';

describe('maskEmail', () => {
  it('keeps the first character of the local part, then ***, then @ and the full domain', () => {
    expect(maskEmail('gabriel@u.nus.edu')).toBe('g***@u.nus.edu');
  });

  it('a one-character local part follows the same rule', () => {
    expect(maskEmail('a@x.com')).toBe('a***@x.com');
  });

  it('keeps the full domain, including subdomains', () => {
    expect(maskEmail('alice@mail.example.co.uk')).toBe('a***@mail.example.co.uk');
  });
});
