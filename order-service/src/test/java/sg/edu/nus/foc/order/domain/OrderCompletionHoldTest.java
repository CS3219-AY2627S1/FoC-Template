package sg.edu.nus.foc.order.domain;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.time.Instant;

import org.junit.jupiter.api.Test;

class OrderCompletionHoldTest {

    private static final Instant START = Instant.parse("2026-10-14T00:00:00Z");

    @Test void authorizedStaleCancellationsExplainHoldAndUnheldStaleCallsStillRejectVersion() {
        Order order = open();
        assertEquals("CONFLICT", assertThrows(OrderProblem.class,
                () -> order.validateOpenCancellation("requester", 99)).getCode());
        order.placeCompletionHold("requester");
        assertEquals("ORDER_ON_HOLD", assertThrows(OrderProblem.class,
                () -> order.validateOpenCancellation("requester", 99)).getCode());
        assertEquals("CONFLICT", assertThrows(OrderProblem.class,
                () -> order.validateOpenCancellation("stranger", 99)).getCode());
        Order accepted = open();
        accepted.accept("courier", 0, START.plusSeconds(60));
        assertEquals("CONFLICT", assertThrows(OrderProblem.class,
                () -> accepted.validateAcceptedCancellation("courier", 99)).getCode());
        accepted.placeCompletionHold("requester");
        assertEquals("ORDER_ON_HOLD", assertThrows(OrderProblem.class,
                () -> accepted.validateAcceptedCancellation("courier", 99)).getCode());
        assertEquals("CONFLICT", assertThrows(OrderProblem.class,
                () -> accepted.validateAcceptedCancellation("stranger", 99)).getCode());
        assertEquals(OrderStatus.ACCEPTED, accepted.getStatus());
    }

    @Test
    void heldDeliveredOrderRejectsBothCompletionPathsWithoutChangingStatus() {
        Order order = delivered();
        assertFalse(order.isCompletionHold());
        order.placeCompletionHold("requester");

        OrderProblem manual = assertThrows(OrderProblem.class,
                () -> order.confirmCompletion("requester", 0));
        assertEquals("COMPLETION_ON_HOLD", manual.getCode());
        assertThrows(OrderProblem.class, () -> order.completeAutomatically(0));
        assertEquals(OrderStatus.DELIVERED, order.getStatus());
        assertTrue(order.isCompletionHold());
    }

    @Test
    void onlyTheOwnerOfANonCompletedOrderCanPlaceAHold() {
        Order order = open();
        assertEquals("FORBIDDEN", assertThrows(OrderProblem.class,
                () -> order.placeCompletionHold("other-requester")).getCode());
        Order completed = delivered();
        completed.confirmCompletion("requester", 0);
        assertThrows(OrderProblem.class, () -> completed.placeCompletionHold("requester"));
        assertFalse(completed.isCompletionHold());
    }

    @Test
    void holdFreezesOpenRefundAndCourierAbortBeforeAnyOutcome() {
        Order open = open();
        open.placeCompletionHold("requester");
        assertThrows(OrderProblem.class, () -> open.cancelOpen("requester", 0));
        assertThrows(OrderProblem.class, () -> open.expire(0, START.plusSeconds(3600)));
        assertEquals(OrderStatus.OPEN, open.getStatus());

        Order accepted = open();
        accepted.accept("courier", 0, START.plusSeconds(60));
        accepted.placeCompletionHold("requester");
        assertThrows(OrderProblem.class, () -> accepted.validateAcceptedCancellation("courier", 0));
        assertEquals(OrderStatus.ACCEPTED, accepted.getStatus());
    }

    @Test void heldOrderCanContinueDeliveryButStillCannotComplete() {
        Order order = open();
        order.placeCompletionHold("requester");
        order.accept("courier", 0, START.plusSeconds(60));
        order.start("courier", 0, START.plusSeconds(120));
        order.markPickedUp("courier", 0);
        order.markDelivered("courier", 0, START.plusSeconds(300));
        assertEquals(OrderStatus.DELIVERED, order.getStatus());
        assertTrue(order.isCompletionHold());
        assertEquals("COMPLETION_ON_HOLD", assertThrows(OrderProblem.class,
                () -> order.confirmCompletion("requester", 0)).getCode());
    }

    private static Order open() {
        return Order.open("requester", "books", "pickup", "delivery", 10, 30,
                START, START.plusSeconds(3600));
    }

    private static Order delivered() {
        Order order = open();
        order.accept("courier", 0, START.plusSeconds(60));
        order.start("courier", 0);
        order.markPickedUp("courier", 0);
        order.markDelivered("courier", 0);
        return order;
    }
}
