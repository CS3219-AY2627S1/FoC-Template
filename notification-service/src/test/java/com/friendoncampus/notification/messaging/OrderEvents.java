package com.friendoncampus.notification.messaging;

import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;

import tools.jackson.databind.json.JsonMapper;

/** Builds {@code OrderTransitioned} envelopes shaped as the shared contract and Order Service publish them. */
final class OrderEvents {

    static final String OCCURRED_AT = "2026-10-30T09:15:00Z";
    static final String TITLE = "Buy coffee";

    private static final JsonMapper JSON = JsonMapper.builder().build();

    private OrderEvents() {
    }

    /** The order's parties, so a test can build a whole lifecycle for one errand. */
    record Errand(UUID orderId, UUID requesterId, UUID correlationId) {
        static Errand create(UUID requesterId) {
            return new Errand(UUID.randomUUID(), requesterId, UUID.randomUUID());
        }
    }

    static final String PICKUP_DEADLINE = "2026-10-30T10:00:00Z";

    static Map<String, Object> transition(Errand errand, long sourceSequence, String action, String fromState,
            String toState, Map<String, Object> actor, UUID previousCourierId, UUID courierId, String reasonCode) {
        return transition(errand, sourceSequence, action, fromState, toState, actor, previousCourierId, courierId,
                reasonCode, PICKUP_DEADLINE);
    }

    /** The same, with the errand's pickup deadline at that point (an EDIT can move it). */
    static Map<String, Object> transition(Errand errand, long sourceSequence, String action, String fromState,
            String toState, Map<String, Object> actor, UUID previousCourierId, UUID courierId, String reasonCode,
            String pickupDeadline) {
        Map<String, Object> snapshot = new LinkedHashMap<>();
        snapshot.put("orderId", errand.orderId().toString());
        snapshot.put("requesterId", errand.requesterId().toString());
        snapshot.put("courierId", courierId == null ? null : courierId.toString());
        snapshot.put("status", toState);
        snapshot.put("title", TITLE);
        snapshot.put("description", "Flat white from the library cafe");
        snapshot.put("creditReward", 3);
        snapshot.put("pickupDeadline", pickupDeadline);
        snapshot.put("pickupLocationId", "11111111-1111-4111-8111-111111111111");
        snapshot.put("dropoffLocationId", "22222222-2222-4222-8222-222222222222");
        snapshot.put("pickupLocationName", "Library cafe");
        snapshot.put("dropoffLocationName", "Block E lobby");

        Map<String, Object> data = new LinkedHashMap<>();
        data.put("orderId", errand.orderId().toString());
        data.put("requesterId", errand.requesterId().toString());
        data.put("previousCourierId", previousCourierId == null ? null : previousCourierId.toString());
        data.put("courierId", courierId == null ? null : courierId.toString());
        data.put("fromState", fromState);
        data.put("toState", toState);
        data.put("action", action);
        data.put("sourceSequence", sourceSequence);
        data.put("reasonCode", reasonCode);
        data.put("snapshot", snapshot);

        Map<String, Object> envelope = new LinkedHashMap<>();
        envelope.put("eventId", UUID.randomUUID().toString());
        envelope.put("eventType", "OrderTransitioned");
        envelope.put("eventVersion", 1);
        envelope.put("aggregateType", "Order");
        envelope.put("aggregateId", errand.orderId().toString());
        envelope.put("aggregateVersion", sourceSequence);
        envelope.put("occurredAt", OCCURRED_AT);
        envelope.put("producer", "order-service");
        envelope.put("correlationId", errand.correlationId().toString());
        envelope.put("causationId", null);
        envelope.put("actor", actor);
        envelope.put("data", data);
        return envelope;
    }

    static Map<String, Object> system() {
        return Map.of("type", "SYSTEM");
    }

    static Map<String, Object> user(UUID userId, String role) {
        Map<String, Object> actor = new LinkedHashMap<>();
        actor.put("type", "USER");
        actor.put("userId", userId.toString());
        actor.put("role", role);
        return actor;
    }

    @SuppressWarnings("unchecked")
    static Map<String, Object> data(Map<String, Object> envelope) {
        return (Map<String, Object>) envelope.get("data");
    }

    static String json(Map<String, Object> envelope) {
        return JSON.writeValueAsString(envelope);
    }
}
