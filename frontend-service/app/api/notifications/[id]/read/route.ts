// AI Assistance Disclosure:
// Tool: Claude Code (model: claude-opus-5-5), date: 2026-11-11
// Scope: Boilerplate generation — Route Handler forwarding POST /notifications/{id}/read through the relay, with the id passed as is (ai-20261111-001).
// Author review: Not confirmed (pending).
// Details: frontend-service/ai/usage-log.md; ai-20261111-001

import { relayJson } from '@/lib/notification-relay';

/** `[id]` goes through as is; Notification Service answers 422 if it isn't an integer. */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  return relayJson(
    request,
    `/notifications/${encodeURIComponent(id)}/read`,
    'POST',
  );
}
