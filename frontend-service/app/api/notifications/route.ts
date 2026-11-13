// AI Assistance Disclosure:
// Tool: Claude Code (model: claude-opus-5-5), date: 2026-11-11
// Scope: Boilerplate generation — Route Handler forwarding GET /notifications with cursor and limit through the relay (ai-20261111-001).
// Author review: Not confirmed (pending).
// Details: frontend-service/ai/usage-log.md; ai-20261111-001

import { forwardQuery, relayJson } from '@/lib/notification-relay';

export const dynamic = 'force-dynamic';

export function GET(request: Request) {
  return relayJson(
    request,
    forwardQuery(request, '/notifications', ['cursor', 'limit']),
  );
}
