package sg.edu.nus.foc.order.domain;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;

import java.time.Instant;
import org.junit.jupiter.api.Test;

class OrderAbortLifecycleTest {
    private static final Instant START = Instant.parse("2026-10-08T00:00:00Z");

    @Test
    void expiredAbortLeavesCurrentOrderExpiredUnderTheSameBusinessId() {
        Order order = accepted();
        String id = order.getId();

        order.abortAfterAcceptedCancellation("courier", 0, START.plusSeconds(3600));

        assertEquals(OrderStatus.EXPIRED, order.getStatus());
        assertEquals(id, order.getId());
        assertNull(order.getCourierId());
    }

    @Test
    void abortAfterStartingIsRejectedWithoutChangingAssignment() {
        Order order = accepted();
        order.start("courier", 0);

        assertThrows(OrderProblem.class,
                () -> order.reopenAfterAcceptedCancellation("courier", 0, START.plusSeconds(20)));

        assertEquals(OrderStatus.IN_PROGRESS, order.getStatus());
        assertEquals("courier", order.getCourierId());
    }

    private Order accepted() {
        Order order = Order.open("requester", "item", "pickup", "delivery", 3, 30,
                START, START.plusSeconds(3600));
        order.accept("courier", 0, START.plusSeconds(1));
        return order;
    }
}
