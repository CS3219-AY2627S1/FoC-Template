package com.campuscouriers.notification_service.event;

import java.util.UUID;

import tools.jackson.core.JacksonException;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

record EventPayload(JsonNode fields) {
    private static final JsonMapper MAPPER = JsonMapper.builder().build();

    static EventPayload read(String value) {
        if (value == null) {
            throw new InvalidNotificationEventException("Missing event payload");
        }
        JsonNode fields;
        try {
            fields = MAPPER.readTree(value);
        } catch (JacksonException exception) {
            throw new InvalidNotificationEventException("Invalid event JSON");
        }
        if (fields == null || !fields.isObject()) {
            throw new InvalidNotificationEventException("Expected a JSON object");
        }
        return new EventPayload(fields);
    }

    String text(String field) {
        JsonNode value = fields.get(field);
        if (value == null || !value.isString()) {
            throw new InvalidNotificationEventException("Missing or invalid " + field);
        }
        return value.asString();
    }

    UUID uuid(String field) {
        return parseUuid(text(field), field);
    }

    static UUID parseUuid(String value, String field) {
        try {
            UUID parsed = UUID.fromString(value);
            if (parsed.toString().equalsIgnoreCase(value)) {
                return parsed;
            }
        } catch (IllegalArgumentException ignored) {
            // Report the field name without including the raw event value.
        }
        throw new InvalidNotificationEventException(field + " must be a canonical UUID");
    }

    long positiveLong(String field) {
        JsonNode value = fields.get(field);
        if (value == null || !value.isIntegralNumber()
                || !value.canConvertToLong() || value.longValue() <= 0) {
            throw new InvalidNotificationEventException(field + " must be a positive integer");
        }
        return value.longValue();
    }
}
