/*
 * AI Assistance Disclosure:
 * Tool: OpenAI Codex (GPT-5), date: 2026-11-08
 * Scope: Implementation and test assistance for chat notification events.
 */
package com.campuscouriers.notification_service.event;

import java.util.UUID;

public record ChatMessageEvent(UUID eventId, UUID messageId, UUID conversationId,
                               UUID errandId, UUID senderId, UUID recipientId,
                               long sequenceNumber) {
}

