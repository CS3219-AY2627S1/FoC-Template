// AI Assistance Disclosure:
// Tool: OpenAI Codex (model: GPT-6), date: 2026-10-21 - 2026-10-22 (Asia/Singapore).
// Scope: Encoded and validated the human-finalized base64url user/sequence bookmark. Replaced user/sequence JSON bookmarks with base64url history-entry IDs.
// Refactor: Moved/imports updated for the human-specified src layout (entry 024).
// Author review: I reviewed and decided to replace the user/sequence JSON bookmarks with base64url history-entry IDs, and added validation.
// Prompts and key responses: ../../ai/usage-log.md, entries 005–025, 043.

import { TextDecoder } from 'node:util';
import { ValidationError } from './validation';

export function encodeHistoryBookmark(entryId: string): string {
  return Buffer.from(entryId, 'utf8').toString('base64url');
}

export function decodeHistoryBookmark(token: unknown): string {
  const invalid = () => new ValidationError('Invalid history page token');
  if (typeof token !== 'string' || !/^[A-Za-z0-9_-]+$/.test(token)) throw invalid();
  const bytes = Buffer.from(token, 'base64url');
  if (bytes.toString('base64url') !== token) throw invalid();
  let entryId: string;
  try {
    entryId = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch (error) {
    if (error instanceof TypeError
      && (error as NodeJS.ErrnoException).code === 'ERR_ENCODING_INVALID_ENCODED_DATA') throw invalid();
    throw error;
  }
  if (entryId.length !== 36
    || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(entryId)) throw invalid();
  return entryId;
}
