package sg.edu.nus.foc.order.application;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;

import java.time.Instant;

import org.junit.jupiter.api.Test;
import org.mapstruct.factory.Mappers;

import sg.edu.nus.foc.order.domain.Order;
import sg.edu.nus.foc.order.domain.OrderStatus;
import sg.edu.nus.foc.order.domain.RepostPlan;
import sg.edu.nus.foc.order.messagingpublisher.dto.OrderCompletionTaskEvent;
import sg.edu.nus.foc.order.messagingpublisher.dto.OpenOrderRefundTaskEvent;
import sg.edu.nus.foc.order.messagingpublisher.mapper.OrderTaskEventMapper;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

class OrderTaskEventFactoryTest {
    @Test void eventIdentitiesDoNotCollideAcrossOrdersOrActors() {
        Order first = Order.open("r", "item", "p", "d", 1, 15, CREATED_AT, EXPIRES_AT);
        Order second = Order.open("r", "item", "p", "d", 1, 15, CREATED_AT, EXPIRES_AT);
        String id = factory.openRefund("shared-key", first, "actor", OCCURRED_AT).getEventId();
        org.junit.jupiter.api.Assertions.assertNotEquals(id, factory.openRefund("shared-key", second, "actor", OCCURRED_AT).getEventId());
        org.junit.jupiter.api.Assertions.assertNotEquals(id, factory.openRefund("shared-key", first, "other", OCCURRED_AT).getEventId());
        assertEquals(id, factory.openRefund("shared-key", first, "actor", OCCURRED_AT).getEventId());
    }
    private static final Instant CREATED_AT = Instant.parse("2026-10-01T10:00:00Z");
    private static final Instant EXPIRES_AT = Instant.parse("2026-10-02T10:00:00Z");
    private static final Instant OCCURRED_AT = Instant.parse("2026-10-01T10:15:00Z");

    private final JsonMapper objectMapper = JsonMapper.builder().build();

    private final OrderTaskEventFactory factory = new OrderTaskEventFactory(
            Mappers.getMapper(OrderTaskEventMapper.class), TestPenaltySequences.store());

    @Test
    void mapsOrderFieldsWithoutSerializingCheckpointHistoryIntoTypedEvents() {
        RepostPlan repostPlan = new RepostPlan(true, EXPIRES_AT, 5, 45, EXPIRES_AT.plusSeconds(3600));
        Order order = Order.open(
                "requester-1",
                "item",
                "pickup-1",
                "delivery-1",
                3,
                30,
                CREATED_AT,
                EXPIRES_AT,
                repostPlan);
        order.linkRepost("repost-1");
        Instant overdueAt = CREATED_AT.plusSeconds(30 * 60L);
        OrderCompletionTaskEvent completion = factory.completion(
                "command-1", order, "requester-1", OCCURRED_AT, false, overdueAt);
        OrderCompletionTaskEvent overdueCompletion = factory.completion(
                "command-2", order, "requester-1", OCCURRED_AT, true, overdueAt);
        OpenOrderRefundTaskEvent openCancellation = factory.openRefund(
                "command-3", order, "requester-1", OCCURRED_AT);

        assertEquals("OrderCompletionTaskEvent", completion.getEventType());
        assertEquals(order.getStatus(), completion.getOrderStatus());
        assertEquals(order.getCourierId(), completion.getCourierId());
        assertEquals(order.getOfferedCredits(), completion.getCreditAmount());
        assertEquals(2, completion.getEventVersion());
        assertEquals(order.getId(), completion.getOrderId());
        assertEquals(order.getVersion() + 1, completion.getOrderVersion());
        JsonNode serializedCompletion = objectMapper.valueToTree(completion);
        assertFalse(serializedCompletion.path("order").has("checkpoints"));
        assertFalse(objectMapper.valueToTree(openCancellation).path("order").has("checkpoints"));
        assertEquals("OrderCompletionTaskEvent", overdueCompletion.getEventType());
        assertEquals("OpenOrderRefundTaskEvent", openCancellation.getEventType());
        assertEquals(order.getOfferedCredits(), openCancellation.getCreditAmount());
    }

    @Test
    void mapsNullInputsWithoutSnapshotTypes() {
        OrderTaskEventMapper mapper = Mappers.getMapper(OrderTaskEventMapper.class);
        assertNull(mapper.toCompletionEvent(null, null, 0, null));
        assertNull(mapper.toOpenRefundEvent(null, null, 0, null));
    }

    @Test
    void mapsExpiredOrderSnapshotToOpenRefundEventWithStableIdentity() {
        Order order = Order.open(
                "requester-3", "expired item", "pickup-3", "delivery-3", 4, 20,
                CREATED_AT, EXPIRES_AT);
        order.expire(0, EXPIRES_AT);
        OpenOrderRefundTaskEvent first = factory.openRefund("EXPIRE:" + order.getId(), order, EXPIRES_AT);
        OpenOrderRefundTaskEvent retry = factory.openRefund("EXPIRE:" + order.getId(), order, EXPIRES_AT);

        assertEquals(first.getEventId(), retry.getEventId());
        assertEquals("OpenOrderRefundTaskEvent", first.getEventType());
        assertEquals(order.getId(), first.getOrderId());
        assertEquals(2, first.getEventVersion());
        assertEquals(OrderStatus.EXPIRED, first.getOrderStatus());
        assertFalse(objectMapper.valueToTree(first).path("order").has("checkpoints"));
    }
}
