// AI Assistance Disclosure:
// Tool: OpenAI Codex (model: GPT-6), dates: 2026-10-20–2026-10-21 (Asia/Singapore).
// Scope: Implemented the human-finalized JSON/UTF-8/SHA-256/signed-big-endian advisory-key encoding.
// Refactor: Moved/imports updated for the human-specified src layout (entry 024).
// Author review: I reviewed that the advisory lock key is generated correctly using SHA-256 and that the output is a signed big-endian bigint. 
// Prompts and key responses: ../../ai/usage-log.md, entries 005–024.

import { createHash } from 'node:crypto';

export function advisoryLockKey(namespace: string, key: string): bigint {
  if (typeof namespace !== 'string' || typeof key !== 'string') {
    throw new TypeError('Advisory lock namespace and key must be strings');
  }
  const text = JSON.stringify([namespace, key]);
  return createHash('sha256').update(text, 'utf8').digest().readBigInt64BE(0);
}
