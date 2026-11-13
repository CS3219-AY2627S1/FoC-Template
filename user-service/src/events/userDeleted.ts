// AI Assistance Disclosure:
// Tool: OpenAI Codex, 2026-11-02 (Asia/Singapore).
// Scope: Added the author-specified user.deleted event builder following the
// existing user.created event pattern. Author review: Reviewed line by line,
// manually tested, and approved. See
// user-service/ai/usage-log.md, entry 026.

import { randomUUID } from 'node:crypto';
import type { UserDeleted } from '@foc/messaging';

export function buildUserDeleted(userId: string, deletedAt: Date): UserDeleted {
  if (typeof userId !== 'string' || userId.trim() === '') {
    throw new Error('userId must be a non-empty string');
  }

  return {
    type: 'user.deleted',
    eventId: randomUUID(),
    occurredAt: deletedAt.toISOString(),
    userId,
    deletedAt: deletedAt.toISOString(),
  };
}
