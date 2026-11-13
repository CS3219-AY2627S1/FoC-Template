package com.friendoncampus.credit.integration;

import java.time.OffsetDateTime;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;

import org.springframework.stereotype.Component;

import com.friendoncampus.credit.domain.CreditOutboxEvent;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.node.ObjectNode;

@Component
public class CreditEventJsonCodec {
    private final ObjectMapper objectMapper;

    public CreditEventJsonCodec(ObjectMapper objectMapper) {
        this.objectMapper = objectMapper;
    }

    public CreditEventEnvelope deserialize(String json) {
        try {
            JsonNode parsed = objectMapper.readTree(json);
            if (!(parsed instanceof ObjectNode root)) {
                throw new IllegalArgumentException("Event envelope must be a JSON object");
            }
            return new CreditEventEnvelope(
                    uuid(root, "eventId"),
                    text(root, "eventType"),
                    integer(root, "eventVersion"),
                    text(root, "aggregateType"),
                    uuid(root, "aggregateId"),
                    longValue(root, "aggregateVersion"),
                    OffsetDateTime.parse(text(root, "occurredAt")),
                    text(root, "producer"),
                    uuid(root, "correlationId"),
                    nullableUuid(root, "causationId"),
                    objectJson(root, "actor"),
                    objectJson(root, "data"));
        } catch (IllegalArgumentException exception) {
            throw exception;
        } catch (RuntimeException exception) {
            throw new IllegalArgumentException("Event envelope must be valid JSON", exception);
        }
    }

    public String serialize(CreditOutboxEvent event) {
        Map<String, Object> envelope = new LinkedHashMap<>();
        envelope.put("eventId", event.getEventId());
        envelope.put("eventType", event.getEventType());
        envelope.put("eventVersion", event.getEventVersion());
        envelope.put("aggregateType", event.getAggregateType());
        envelope.put("aggregateId", event.getAggregateId());
        envelope.put("aggregateVersion", event.getAggregateVersion());
        envelope.put("occurredAt", event.getOccurredAt());
        envelope.put("producer", event.getProducer());
        envelope.put("correlationId", event.getCorrelationId());
        envelope.put("causationId", event.getCausationId());
        envelope.put("actor", readStoredObject(event.getActorJson(), "actor"));
        envelope.put("data", readStoredObject(event.getPayloadJson(), "data"));
        try {
            return objectMapper.writeValueAsString(envelope);
        } catch (RuntimeException exception) {
            throw new IllegalStateException("Credit event could not be serialized", exception);
        }
    }

    private JsonNode readStoredObject(String json, String field) {
        try {
            JsonNode node = objectMapper.readTree(json);
            if (!node.isObject()) {
                throw new IllegalStateException("Stored event " + field + " must be a JSON object");
            }
            return node;
        } catch (RuntimeException exception) {
            throw new IllegalStateException("Stored event " + field + " must be valid JSON", exception);
        }
    }

    private String objectJson(ObjectNode root, String field) {
        JsonNode value = root.get(field);
        if (value == null || !value.isObject()) {
            throw new IllegalArgumentException(field + " must be a JSON object");
        }
        return objectMapper.writeValueAsString(value);
    }

    private static String text(ObjectNode root, String field) {
        JsonNode value = root.get(field);
        if (value == null || !value.isString() || value.stringValue().isBlank()) {
            throw new IllegalArgumentException(field + " must be non-blank text");
        }
        return value.stringValue();
    }

    private static UUID uuid(ObjectNode root, String field) {
        try {
            return UUID.fromString(text(root, field));
        } catch (IllegalArgumentException exception) {
            throw new IllegalArgumentException(field + " must be a UUID string", exception);
        }
    }

    private static UUID nullableUuid(ObjectNode root, String field) {
        JsonNode value = root.get(field);
        return value == null || value.isNull() ? null : uuid(root, field);
    }

    private static int integer(ObjectNode root, String field) {
        JsonNode value = root.get(field);
        if (value == null || !value.isIntegralNumber() || !value.canConvertToInt()) {
            throw new IllegalArgumentException(field + " must be an integer");
        }
        return value.intValue();
    }

    private static long longValue(ObjectNode root, String field) {
        JsonNode value = root.get(field);
        if (value == null || !value.isIntegralNumber() || !value.canConvertToLong()) {
            throw new IllegalArgumentException(field + " must be an integer");
        }
        return value.longValue();
    }
}
