/*
 * AI Assistance Disclosure:
 * Tool: OpenAI Codex (GPT-5), date: 2026-11-08
 * Scope: Implementation and test assistance for chat notification events.
 */
package com.campuscouriers.notification_service.event;

import java.nio.charset.StandardCharsets;
import java.util.UUID;
import org.apache.kafka.clients.consumer.ConsumerRecord;
import org.apache.kafka.common.header.Header;
import org.springframework.stereotype.Component;

@Component
public class ChatMessageEventParser {
    public ChatMessageEvent parse(ConsumerRecord<String, String> record) {
        Header header = record.headers().lastHeader("eventId");
        if (header == null || header.value() == null) {
            throw new InvalidNotificationEventException("Missing eventId header");
        }
        UUID eventId = EventPayload.parseUuid(
            new String(header.value(), StandardCharsets.UTF_8), "eventId header");
        EventPayload payload = EventPayload.read(record.value());
        return new ChatMessageEvent(
            eventId,
            payload.uuid("messageId"),
            payload.uuid("conversationId"),
            payload.uuid("errandId"),
            payload.uuid("senderId"),
            payload.uuid("recipientId"),
            payload.positiveLong("sequenceNumber"));
    }
}

