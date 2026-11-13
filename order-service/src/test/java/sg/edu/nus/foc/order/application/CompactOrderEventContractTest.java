package sg.edu.nus.foc.order.application;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.time.Instant;
import java.util.HashSet;
import java.util.Set;

import org.junit.jupiter.api.Test;
import org.mapstruct.factory.Mappers;

import sg.edu.nus.foc.order.domain.Order;
import sg.edu.nus.foc.order.messagingpublisher.mapper.OrderTaskEventMapper;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

class CompactOrderEventContractTest {

    private static final Instant CREATED = Instant.parse("2026-10-09T10:00:00Z");
    private static final Instant EXPIRY = CREATED.plusSeconds(3600);
    private static final Set<String> FIELDS = Set.of(
            "eventId", "eventType", "orderId", "orderStatus", "creditAmount", "occurredAt", "courierId");

    private final JsonMapper json = JsonMapper.builder().build();
    private final OrderTaskEventFactory factory = new OrderTaskEventFactory(
            Mappers.getMapper(OrderTaskEventMapper.class), TestPenaltySequences.store());

    @Test
    void cancellationAndExpiryUseExactlySevenFieldsIncludingNullCourier() {
        Order cancelled = order();
        cancelled.cancelOpen("requester", 0);
        JsonNode cancellation = json.valueToTree(factory.openRefund(
                "cancel", cancelled, "requester", CREATED.plusSeconds(60)));
        assertFields(cancellation);
        assertEquals("CANCELLED", cancellation.path("orderStatus").asString());
        assertEquals(7, cancellation.path("creditAmount").asInt());
        assertTrue(cancellation.path("courierId").isNull());
        assertEquals(cancelled.getId(), cancellation.path("orderId").asString());

        Order expired = order();
        expired.expire(0, EXPIRY);
        JsonNode expiration = json.valueToTree(factory.openRefund("expire", expired, EXPIRY));
        assertFields(expiration);
        assertEquals("EXPIRED", expiration.path("orderStatus").asString());
        assertEquals("OpenOrderRefundTaskEvent", expiration.path("eventType").asString());
    }

    @Test
    void completionUsesTheSameCompactContractRegardlessOfOverdue() {
        Order completed = order();
        completed.accept("courier", 0, CREATED.plusSeconds(1));
        completed.start("courier", 0);
        completed.markPickedUp("courier", 0);
        completed.markDelivered("courier", 0);
        completed.confirmCompletion("requester", 0);
        for (boolean overdue : new boolean[] {false, true}) {
            JsonNode event = json.valueToTree(factory.completion(
                    "complete", completed, "requester", CREATED.plusSeconds(5), overdue, EXPIRY));
            assertFields(event);
            assertEquals("COMPLETED", event.path("orderStatus").asString());
            assertEquals("courier", event.path("courierId").asString());
            assertEquals(7, event.path("creditAmount").asInt());
            assertEquals("OrderCompletionTaskEvent", event.path("eventType").asString());
        }
    }

    private void assertFields(JsonNode event) {
        assertEquals(FIELDS, names(event));
    }

    private Set<String> names(JsonNode node) {
        Set<String> names = new HashSet<>();
        node.propertyNames().forEach(names::add);
        return names;
    }

    private Order order() {
        return Order.open("requester", "item", "pickup", "delivery", 7, 30, CREATED, EXPIRY);
    }
}
