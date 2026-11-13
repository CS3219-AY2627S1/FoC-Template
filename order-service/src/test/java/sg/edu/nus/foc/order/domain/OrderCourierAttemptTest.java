package sg.edu.nus.foc.order.domain;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

import java.time.Instant;
import org.junit.jupiter.api.Test;

class OrderCourierAttemptTest {
    @Test
    void immutableSnapshotSurvivesReopeningAndReassignment() {
        Instant now = Instant.now();
        Order order = Order.open("requester", "item", "pickup", "delivery", 5, 30, now, now.plusSeconds(3600));
        order.accept("first", 0, now);
        OrderCourierAttempt attempt = new OrderCourierAttempt(order, "first", 0, now.plusSeconds(1));
        order.reopenAfterAcceptedCancellation("first", 0, now.plusSeconds(1));
        order.accept("second", 0, now.plusSeconds(2));

        Order historical = Order.historicalAttempt(attempt);
        assertEquals("first", historical.getCourierId());
        assertEquals(OrderStatus.ABORTED, historical.getStatus());
        assertEquals(order.getId(), historical.getId());
        assertEquals(attempt.getId(), historical.getAttemptId());
        assertNotEquals(order.getRowId(), historical.getRowId());
        assertEquals("second", order.getCourierId());
        assertEquals(5, historical.getOfferedCredits());
    }

    @Test
    void anotherCourierCannotCreateAnAbortedHistorySnapshot() {
        Instant now = Instant.now();
        Order order = Order.open("requester", "item", "pickup", "delivery", 5, 30, now, now.plusSeconds(3600));
        order.accept("courier", 0, now);
        assertThrows(OrderProblem.class, () -> new OrderCourierAttempt(order, "other", 0, now));
    }
}
