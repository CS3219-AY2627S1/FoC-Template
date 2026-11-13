// AI Assistance Disclosure:
// Tool: Claude Code (model: claude-opus-5-5), date: 2026-11-11
// Scope: Boilerplate generation — Route Handler forwarding POST /notifications/read-all through the relay (ai-20261111-001).
// Author review: Not confirmed (pending).
// Details: frontend-service/ai/usage-log.md; ai-20261111-001

import { relayJson } from '@/lib/notification-relay';

export function POST(request: Request) {
  return relayJson(request, '/notifications/read-all', 'POST');
}
