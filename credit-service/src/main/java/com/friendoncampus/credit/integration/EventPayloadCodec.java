package com.friendoncampus.credit.integration;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.TreeMap;

import org.springframework.stereotype.Component;

import tools.jackson.databind.ObjectMapper;

@Component
class EventPayloadCodec {

    private final ObjectMapper objectMapper;

    EventPayloadCodec(ObjectMapper objectMapper) {
        this.objectMapper = objectMapper;
    }

    CanonicalPayload canonicalize(String payloadJson) {
        try {
            Object parsed = objectMapper.readValue(payloadJson, Object.class);
            String canonicalJson = objectMapper.writeValueAsString(normalize(parsed));
            return new CanonicalPayload(canonicalJson, EventFingerprint.sha256(canonicalJson));
        } catch (RuntimeException exception) {
            throw new IllegalArgumentException("Event payload must be valid JSON", exception);
        }
    }

    private static Object normalize(Object value) {
        if (value instanceof Map<?, ?> map) {
            Map<String, Object> sorted = new TreeMap<>();
            map.forEach((key, child) -> sorted.put(String.valueOf(key), normalize(child)));
            return sorted;
        }
        if (value instanceof List<?> list) {
            List<Object> normalized = new ArrayList<>(list.size());
            list.forEach(child -> normalized.add(normalize(child)));
            return normalized;
        }
        return value;
    }

    record CanonicalPayload(String json, String hash) {
    }
}
