package com.friendoncampus.notification.messaging;

import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;

import tools.jackson.databind.json.JsonMapper;

/** Builds {@code credit.events} envelopes shaped exactly as Credit Service publishes them. */
final class CreditEvents {

    static final String OCCURRED_AT = "2026-10-30T09:15:00Z";

    private static final JsonMapper JSON = JsonMapper.builder().build();

    private CreditEvents() {
    }

    static Map<String, Object> envelope(String eventType, String aggregateType, UUID aggregateId,
            Map<String, Object> data) {
        Map<String, Object> envelope = new LinkedHashMap<>();
        envelope.put("eventId", UUID.randomUUID().toString());
        envelope.put("eventType", eventType);
        envelope.put("eventVersion", 1);
        envelope.put("aggregateType", aggregateType);
        envelope.put("aggregateId", aggregateId.toString());
        envelope.put("aggregateVersion", 1);
        envelope.put("occurredAt", OCCURRED_AT);
        envelope.put("producer", "credit-service");
        envelope.put("correlationId", UUID.randomUUID().toString());
        envelope.put("causationId", UUID.randomUUID().toString());
        envelope.put("actor", Map.of("type", "SYSTEM"));
        envelope.put("data", data);
        return envelope;
    }

    static Map<String, Object> accountAllocated(UUID userId) {
        Map<String, Object> data = new LinkedHashMap<>();
        data.put("operationId", UUID.randomUUID().toString());
        data.put("userId", userId.toString());
        data.put("allocatedAmount", 10);
        data.put("availableBalance", 10);
        return envelope("CreditAccountAllocated", "User", userId, data);
    }

    static Map<String, Object> settled(UUID orderId, UUID requesterId, UUID courierId, int amount) {
        Map<String, Object> data = new LinkedHashMap<>();
        data.put("operationId", UUID.randomUUID().toString());
        data.put("orderId", orderId.toString());
        data.put("requesterId", requesterId.toString());
        data.put("courierId", courierId.toString());
        data.put("transferredAmount", amount);
        data.put("requesterAvailableBalance", 7);
        data.put("courierAvailableBalance", 13);
        return envelope("CreditSettled", "Order", orderId, data);
    }

    static Map<String, Object> compensated(UUID orderId, UUID requesterId, UUID courierId, int transferred) {
        Map<String, Object> data = new LinkedHashMap<>();
        data.put("operationId", UUID.randomUUID().toString());
        data.put("orderId", orderId.toString());
        data.put("requesterId", requesterId.toString());
        data.put("courierId", courierId.toString());
        data.put("transferredAmount", transferred);
        data.put("releasedAmount", 4);
        data.put("requesterAvailableBalance", 9);
        data.put("courierAvailableBalance", 11);
        return envelope("CourierCompensated", "Order", orderId, data);
    }

    static Map<String, Object> reserved(UUID orderId) {
        Map<String, Object> data = new LinkedHashMap<>();
        data.put("operationId", UUID.randomUUID().toString());
        data.put("orderId", orderId.toString());
        data.put("reservationId", UUID.randomUUID().toString());
        data.put("amount", 5);
        data.put("availableBalance", 5);
        data.put("reservedBalance", 5);
        return envelope("CreditReserved", "Order", orderId, data);
    }

    @SuppressWarnings("unchecked")
    static Map<String, Object> data(Map<String, Object> envelope) {
        return (Map<String, Object>) envelope.get("data");
    }

    static String json(Map<String, Object> envelope) {
        return JSON.writeValueAsString(envelope);
    }
}
