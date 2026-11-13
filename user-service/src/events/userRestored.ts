// AI Assistance Disclosure:
// Tool: OpenAI Codex, 2026-11-02 (Asia/Singapore).
// Scope: Added the author-specified user.restored event builder following the
// existing user event pattern. Author review: Author specified the restore
// event requirements; reviewed, manually tested, and approved. See
// user-service/ai/usage-log.md, entry 027.

import { randomUUID } from 'node:crypto';
import type { UserRestored } from '@foc/messaging';

export function buildUserRestored(userId: string, previousUserId: string): UserRestored {
  if (!userId.trim() || !previousUserId.trim()) {
    throw new Error('userId and previousUserId must be non-empty strings');
  }

  return {
    type: 'user.restored',
    eventId: randomUUID(),
    occurredAt: new Date().toISOString(),
    userId,
    previousUserId,
  };
}
