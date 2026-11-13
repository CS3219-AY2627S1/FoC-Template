package sg.edu.nus.foc.order.domain;

import static org.junit.jupiter.api.Assertions.*;
import java.time.Instant;
import org.junit.jupiter.api.Test;

class OrderDeliveryReviewTest {
    private static final Instant BASE = Instant.parse("2026-10-01T00:00:00Z");

    private Order progressing() {
        Order order = Order.open("owner", "parcel", "pickup", "delivery", 5, 30, BASE, BASE.plusSeconds(7200));
        order.accept("courier", 0, BASE.plusSeconds(1));
        order.start("courier", 0, BASE.plusSeconds(60));
        order.markPickedUp("courier", 0);
        return order;
    }

    @Test
    void classifiesAtActualDeliveryAndWaivesWithoutChangingTheFactualOutcome() {
        Order order = progressing();
        assertNull(order.getOverdue());
        order.markDelivered("courier", 0, BASE.plusSeconds(1900));
        assertEquals(Boolean.TRUE, order.getOverdue());
        order.waiveOverdue("admin", "  Valid explanation  ", BASE.plusSeconds(2000));
        assertTrue(order.isOverduePenaltyWaived());
        assertEquals(Boolean.TRUE, order.getOverdue());
        assertEquals("Valid explanation", order.getOverdueWaiverReason());
        order.waiveOverdue("admin", "Valid explanation", BASE.plusSeconds(2100));
        assertEquals(BASE.plusSeconds(2000), order.getOverdueWaivedAt());
        assertThrows(OrderProblem.class, () -> order.waiveOverdue("other", "Different", BASE.plusSeconds(2200)));
    }

    @Test
    void rejectsWaiverBeforeDeliveryAndAfterCompletion() {
        Order order = progressing();
        assertThrows(OrderProblem.class, () -> order.waiveOverdue("admin", "Reason", BASE));
        order.markDelivered("courier", 0, BASE.plusSeconds(1900));
        order.confirmCompletion("owner", 0);
        assertThrows(OrderProblem.class, () -> order.waiveOverdue("admin", "Reason", BASE));
    }
}
