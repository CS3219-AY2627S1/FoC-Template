package com.friendoncampus.user.messaging;

import java.time.OffsetDateTime;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.databind.ObjectMapper;

@Service
public class UserActivationEvents {
    private final UserOutboxRepository outbox;
    private final ObjectMapper json;

    public UserActivationEvents(UserOutboxRepository outbox, ObjectMapper json) {
        this.outbox = outbox;
        this.json = json;
    }

    @Transactional(propagation = Propagation.MANDATORY)
    public void record(UUID userId, OffsetDateTime activatedAt) {
        UUID eventId = UUID.randomUUID();
        UUID operationId = UUID.randomUUID();
        UUID correlationId = UUID.randomUUID();
        Map<String, Object> envelope = new LinkedHashMap<>();
        envelope.put("eventId", eventId);
        envelope.put("eventType", "UserActivated");
        envelope.put("eventVersion", 1);
        envelope.put("aggregateType", "User");
        envelope.put("aggregateId", userId);
        envelope.put("aggregateVersion", 1);
        envelope.put("occurredAt", activatedAt.toString());
        envelope.put("producer", "user-service");
        envelope.put("correlationId", correlationId);
        envelope.put("causationId", null);
        envelope.put("actor", Map.of("type", "USER", "userId", userId, "role", "REQUESTER"));
        envelope.put("data", Map.of("operationId", operationId, "userId", userId,
                "activatedAt", activatedAt.toString()));
        outbox.save(UserOutboxEvent.activation(eventId, userId, operationId, correlationId,
                activatedAt, json.writeValueAsString(envelope)));
    }
}
