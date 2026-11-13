package sg.edu.nus.foc.order.domain;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.time.Instant;
import org.junit.jupiter.api.Test;
import sg.edu.nus.foc.common.penalty.PenaltySystemPolicy;

class OrderStoredTimingTest {
    private static final Instant ACCEPTED = Instant.parse("2026-10-17T10:00:00Z");

    private Order accepted() {
        Order order = Order.open("requester", "item", "pickup", "delivery", 3, 30,
                ACCEPTED.minusSeconds(60), ACCEPTED.plusSeconds(7200));
        order.accept("courier", 0, ACCEPTED);
        return order;
    }

    @Test
    void clockStartsAtStartAndDeliveryFreezesTheObservation() {
        Order order = accepted();
        assertNull(order.overdueAt(ACCEPTED.plusSeconds(7200)));
        Instant started = ACCEPTED.plusSeconds(3600);
        order.start("courier", 0, started);
        assertEquals(started.plusSeconds(1800), order.getDeliveryDeadlineAt());
        assertNull(order.overdueAt(started.plusSeconds(1800)));
        assertNull(order.overdueAt(started.plusSeconds(1801)));
        order.markPickedUp("courier", 0);
        order.markDelivered("courier", 0, started.plusSeconds(1200));
        assertFalse(order.overdueAt(started.plusSeconds(86400)));
        assertEquals(started.plusSeconds(1200), order.getDeliveredAt());
    }

    @Test
    void invalidActorCannotStartOrPersistTiming() {
        Order order = accepted();
        assertThrows(OrderProblem.class, () -> order.start("other", 0, ACCEPTED));
        assertNull(order.getDeliveryDeadlineAt());
        assertEquals(OrderStatus.ACCEPTED, order.getStatus());
    }

    @Test
    void actualDeliveryAfterTheDeadlineIsOverdueEvenAtLaterConfirmation() {
        Order order = accepted();
        order.start("courier", 0, ACCEPTED);
        order.markPickedUp("courier", 0);
        order.markDelivered("courier", 0, ACCEPTED.plusSeconds(1801));
        assertTrue(order.overdueAt(ACCEPTED.plusSeconds(86400)));
        order.confirmCompletion("requester", 0);
        assertTrue(order.getOverdue());
    }

    @Test
    void adminWaiverAndAdditionAreExplicitAndCancellationFreezesTiming() {
        Order waived = accepted();
        waived.start("courier", 0, ACCEPTED);
        waived.placeCompletionHold("requester");
        waived.cancelByAdmin("requester", "courier", ACCEPTED.plusSeconds(60), null);
        assertEquals(AdminPenaltyDecision.WAIVED, waived.getAdminPenaltyDecision());
        assertEquals(0, waived.getAdminPenaltyAmount());
        assertNull(waived.getAdminPenaltyReason());
        assertNull(waived.overdueAt(ACCEPTED.plusSeconds(86400)));
        assertTrue(waived.isCompletionHold());

        Order penalized = accepted();
        penalized.cancelByAdmin("requester", "courier", ACCEPTED,
                PenaltySystemPolicy.WRONG_LOCATION_DELIVERY);
        assertEquals(AdminPenaltyDecision.ADDITION_REQUESTED, penalized.getAdminPenaltyDecision());
        assertEquals(4, penalized.getAdminPenaltyAmount());
        assertEquals(PenaltySystemPolicy.WRONG_LOCATION_DELIVERY, penalized.getAdminPenaltyReason());
    }
}
