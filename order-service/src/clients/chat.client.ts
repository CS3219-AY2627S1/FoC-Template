/*
 * AI Assistance Disclosure:
 * Tool: Codex (model: GPT-6), date: 2026-11-08
 * Scope: Implemented the team-specified chat creation and system notification calls.
 * No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review: tng wen xi
 * Scope (2026-11-08, Codex, model: GPT-6): Removed the description from system message text per user instruction.
 * Author review: tng wen xi
 * Scope (2026-11-08, Codex, model: GPT-6): Implemented team-specified status notifications and username fallback.
 * Author review: tng wen xi
 * Scope (2026-11-08, Codex, model: GPT-6): Implemented or tested team-specified order-based courier participant delivery.
 * Author review: tng wen xi
 * Scope (2026-11-10, Codex, model: GPT-6): Implemented or tested team-specified order chat archiving after final notifications.
 * Author review: tng wen xi
 * Scope (2026-11-10, Codex, model: GPT-6): Implemented or verified user-specified order message actor fields and toast filtering.
 * No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review: tng wen xi
 */
import type {
  ChatNotificationPayload,
  ChatParticipantPayload,
  ChatCreatePayload,
} from '../queue/tasks.js';
import type { CreditCallResult } from './credits.client.js';

export interface ChatClient {
  addParticipant(input: ChatParticipantPayload): Promise<CreditCallResult>;
  create(input: ChatCreatePayload): Promise<CreditCallResult>;
  notify(input: ChatNotificationPayload): Promise<CreditCallResult>;
}

export function createHttpChatClient(
  baseUrl: string,
  apiKey: string,
  fetchImpl: typeof fetch = fetch,
): ChatClient {
  async function post(path: string, body?: object): Promise<CreditCallResult> {
    try {
      const response = await fetchImpl(new URL(path, baseUrl), {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'X-Service-Name': 'order-service',
          'X-Service-Key': apiKey,
        },
        body: JSON.stringify(body),
      });
      if (response.ok) return { ok: true };
      return {
        ok: false,
        kind: response.status >= 500 ? 'transient' : 'permanent',
        status: response.status,
        code: `HTTP_${response.status}`,
      };
    } catch (error) {
      return {
        ok: false,
        kind: 'transient',
        code: error instanceof Error ? error.message : 'NETWORK_ERROR',
      };
    }
  }
  return {
    addParticipant: ({ orderId, ...body }) =>
      post(`/chat/orders/${encodeURIComponent(orderId)}/participants`, body),
    // AI-generated
    async notify({ archiveAfter, ...input }) {
      const notified = await post('/chat/send-system-notification', input);
      if (!notified.ok || !archiveAfter) return notified;
      // Retry uses the same message ID; chat-service deduplicates even after archive.
      return post(`/chat/orders/${encodeURIComponent(input.orderId!)}/archive`);
    },
    async create(input) {
      const { orderId, requesterId, orderDescription, messageId } = input;
      const created = await post('/chat/conversations', {
        orderId,
        requesterId,
        orderDescription,
      });
      if (!created.ok) return created;
      return post('/chat/send-system-notification', {
        orderId,
        messageId,
        message: 'The order has been created',
        triggeredByUserId: requesterId,
      });
    },
  };
}
