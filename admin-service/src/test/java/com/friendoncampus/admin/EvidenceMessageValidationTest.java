package com.friendoncampus.admin;

import static org.junit.jupiter.api.Assertions.*;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.node.ObjectNode;
import tools.jackson.databind.json.JsonMapper;

class EvidenceMessageValidationTest {
    private final JsonMapper json = JsonMapper.builder().build();

    private ObjectNode record(String text) {
        ObjectNode value = json.createObjectNode();
        value.put("orderId", EvidenceFixtures.ORDER.toString()).put("actorUserId", EvidenceFixtures.ACTOR.toString());
        value.put("action", "MessageSent").put("sourceSequence", 1);
        value.put("occurredAt", "2026-11-10T01:00:00Z").put("ingestedAt", "2026-11-10T01:00:00Z");
        String id = UUID.randomUUID().toString();
        value.put("eventId", id).put("source", "chat-service").put("stream", "chat.messages");
        ObjectNode data = json.createObjectNode();
        data.put("kind", "CHAT").put("caseId", EvidenceFixtures.CASE.toString());
        data.put("conversationId", UUID.randomUUID().toString()).put("conversationType", "ERRAND");
        data.putNull("participantUserId");
        data.put("messageId", id).put("messageType", "TEXT").put("text", text);
        data.putNull("attachment");
        value.set("data", data);
        return value;
    }

    @Test void originalTextUsesChatLimitWithoutBeingRewritten() {
        ObjectNode record = record("x".repeat(4000));
        assertDoesNotThrow(() -> EvidenceValidation.record(record, EvidenceFixtures.ORDER));
        assertEquals("x".repeat(4000), record.path("data").path("text").asText());
        ((ObjectNode) record.path("data")).put("text", "x".repeat(4001));
        assertThrows(IllegalArgumentException.class, () -> EvidenceValidation.record(record, EvidenceFixtures.ORDER));
    }

    @Test void malformedPrivateContextAndUnscopedImageEvidenceAreRejected() {
        ObjectNode record = record("Original statement");
        ObjectNode data = (ObjectNode) record.path("data");
        data.put("conversationType", "CASE");
        assertThrows(IllegalArgumentException.class, () -> EvidenceValidation.record(record, EvidenceFixtures.ORDER));
        data.put("conversationType", "ERRAND").put("messageType", "IMAGE");
        assertThrows(IllegalArgumentException.class, () -> EvidenceValidation.record(record, EvidenceFixtures.ORDER));
    }
}
