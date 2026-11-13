package sg.edu.nus.foc.order.application;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotEquals;

import java.time.Instant;
import java.util.HashSet;
import java.util.Set;

import org.junit.jupiter.api.Test;
import org.mapstruct.factory.Mappers;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

import sg.edu.nus.foc.common.penalty.PenaltySystemPolicy;
import sg.edu.nus.foc.order.domain.Order;
import sg.edu.nus.foc.order.messagingpublisher.dto.OrderTaskEvent;
import sg.edu.nus.foc.order.messagingpublisher.mapper.OrderTaskEventMapper;

class CourierPenaltyEventContractTest {

    private static final Instant NOW = Instant.parse("2026-10-14T10:00:00Z");
    private static final Set<PenaltySystemPolicy> AUTOMATIC_ORDER_REASONS = Set.of(
            PenaltySystemPolicy.ACCEPTED_TASK_CANCELLATION,
            PenaltySystemPolicy.OVERDUE_DELIVERY,
            PenaltySystemPolicy.SUCCESSFUL_DELIVERY);

    private final OrderTaskEventFactory factory = new OrderTaskEventFactory(Mappers.getMapper(OrderTaskEventMapper.class), TestPenaltySequences.store());
    private final JsonMapper json = JsonMapper.builder().build();

    @Test
    void serializesExactlyEightFieldsWithApprovedPositiveAmountsAndCourierRecipient() {
        Order order = order();
        // Shared report-case mappings do not introduce new automatic Order flows.
        for (PenaltySystemPolicy reason : AUTOMATIC_ORDER_REASONS) {
            OrderTaskEvent event = factory.penalty("command", order, "courier", NOW, reason);
            JsonNode payload = json.valueToTree(event);
            Set<String> fields = new HashSet<>(payload.propertyNames());
            assertEquals(Set.of("eventId", "eventType", "orderId", "courierId", "penaltyAmount", "occurredAt", "appliedReason", "courierSequence"), fields);
            assertEquals(reason == PenaltySystemPolicy.ACCEPTED_TASK_CANCELLATION ? 2 : 1, payload.get("penaltyAmount").asInt());
            assertEquals(reason.name(), payload.get("appliedReason").asString());
            assertEquals("courier", payload.get("courierId").asString());
            assertEquals(order.getId(), payload.get("orderId").asString());
            assertEquals(NOW.toString(), payload.get("occurredAt").asString());
            org.junit.jupiter.api.Assertions.assertTrue(payload.get("courierSequence").asLong() > 0);
            assertEquals(2, event.getEventVersion());
            assertEquals(reason == PenaltySystemPolicy.SUCCESSFUL_DELIVERY
                    ? "PenaltyScoreDeductionEvent" : "PenaltyScoreAdditionEvent", event.getEventType());
        }
    }

    @Test
    void retryKeepsStableIdWhileDifferentCommandRecipientOrDirectionIsDistinct() {
        Order order = order();
        OrderTaskEvent first = factory.penalty("command", order, "courier", NOW, PenaltySystemPolicy.OVERDUE_DELIVERY);
        assertEquals(first.getEventId(), factory.penalty("command", order, "courier", NOW.plusSeconds(30), PenaltySystemPolicy.OVERDUE_DELIVERY).getEventId());
        assertNotEquals(first.getEventId(), factory.penalty("command-2", order, "courier", NOW, PenaltySystemPolicy.OVERDUE_DELIVERY).getEventId());
        assertNotEquals(first.getEventId(), factory.penalty("command", order, "other-courier", NOW, PenaltySystemPolicy.OVERDUE_DELIVERY).getEventId());
        assertNotEquals(first.getEventId(), factory.penalty("command", order, "courier", NOW, PenaltySystemPolicy.SUCCESSFUL_DELIVERY).getEventId());
        assertNotEquals(first.getEventId(), factory.penalty("command", order, "courier", NOW, PenaltySystemPolicy.ACCEPTED_TASK_CANCELLATION).getEventId());
    }

    private Order order() {
        return Order.open("requester", "item", "pickup", "delivery", 3, 15, NOW, NOW.plusSeconds(3600));
    }
}
