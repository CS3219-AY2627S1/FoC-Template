package sg.edu.nus.foc.order.application;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.time.Instant;
import java.util.Optional;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import sg.edu.nus.foc.order.domain.Order;
import sg.edu.nus.foc.order.domain.repository.OrderRepository;

class RepostFailureRecorderTest {
    private static final Instant NOW = Instant.parse("2026-10-09T10:00:00Z");

    private Order original() {
        Order order = Order.open("owner", "item", "pickup", "delivery", 1, 15,
                NOW.minusSeconds(7200), NOW.minusSeconds(3600));
        order.expire(0, NOW);
        return order;
    }

    @ParameterizedTest
    @CsvSource(delimiter = '|', value = {
        "INSUFFICIENT_CREDITS|Repost failed: insufficient available credits.",
        "UNAUTHENTICATED|Repost could not be authorized. Please sign in again.",
        "FORBIDDEN|Repost could not be authorized. Please sign in again.",
        "VALIDATION_ERROR|Repost failed: check the request details.",
        "REPOST_EXPIRED|Repost expired before it could be posted.",
        "CONFLICT|This request could not be reposted. Refresh and check its status.",
        "NOT_FOUND|Repost failed: a required account or location is unavailable.",
        "SERVICE_UNAVAILABLE|Could not repost right now. Please try again later."
    })
    void savesOnlySafeLatestMessage(String code, String message) {
        OrderRepository orders = mock(OrderRepository.class);
        Order order = original();
        when(orders.getForUpdate(order.getId())).thenReturn(Optional.of(order));
        RepostFailureRecorder recorder = new RepostFailureRecorder(orders);
        recorder.record(order.getId(), code, NOW);
        assertEquals(code, order.getRepostFailureCode());
        assertEquals(message, order.getRepostFailureMessage());
        assertEquals(NOW, order.getRepostFailureAt());
        recorder.record(order.getId(), "VALIDATION_ERROR", NOW.minusSeconds(1));
        assertEquals(message, order.getRepostFailureMessage(), "An older callback cannot overwrite a newer result");
    }

    @Test
    void doesNotChangeMissingLiveOrAlreadyRepostedOrders() {
        OrderRepository orders = mock(OrderRepository.class);
        RepostFailureRecorder recorder = new RepostFailureRecorder(orders);
        when(orders.getForUpdate("missing")).thenReturn(Optional.empty());
        recorder.record("missing", "CONFLICT", NOW);
        Order live = Order.open("owner", "item", "p", "d", 1, 15, NOW, NOW.plusSeconds(3600));
        when(orders.getForUpdate(live.getId())).thenReturn(Optional.of(live));
        recorder.record(live.getId(), "CONFLICT", NOW);
        Order linked = original();
        linked.linkRepost("new-order");
        when(orders.getForUpdate(linked.getId())).thenReturn(Optional.of(linked));
        recorder.record(linked.getId(), "CONFLICT", NOW);
        verify(orders, never()).save(any());
    }
}
