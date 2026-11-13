package sg.edu.nus.foc.order.domain;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

import java.time.Instant;
import org.junit.jupiter.api.Test;

class OrderEventOutboxTest {
    private static final Instant NOW = Instant.parse("2026-10-01T10:00:00Z");

    @Test
    void claimPublishAndRetryFollowOutboxStateTransitions() {
        OrderEventOutbox outbox = pending();

        outbox.claim(NOW, NOW.plusSeconds(30));
        assertEquals(OutboxState.IN_PROGRESS, outbox.getState());
        assertEquals(1, outbox.getAttemptCount());
        assertEquals(NOW.plusSeconds(30), outbox.getLeaseUntil());

        Instant retryAt = NOW.plusSeconds(60);
        outbox.scheduleRetry(retryAt, "temporary failure");
        assertEquals(OutboxState.PENDING, outbox.getState());
        assertEquals(retryAt, outbox.getNextAttemptAt());
        assertEquals("temporary failure", outbox.getLastError());
        assertEquals(null, outbox.getLeaseUntil());

        outbox.claim(retryAt, retryAt.plusSeconds(30));
        outbox.markPublished(retryAt.plusSeconds(1));
        assertEquals(OutboxState.PUBLISHED, outbox.getState());
        assertEquals(retryAt.plusSeconds(1), outbox.getPublishedAt());
        assertEquals(null, outbox.getLastError());
    }

    @Test
    void doesNotAllowInvalidClaimOrStateTransitions() {
        OrderEventOutbox outbox = pending();
        assertThrows(IllegalStateException.class, () -> outbox.claim(NOW, NOW));
        assertThrows(IllegalStateException.class, () -> outbox.markPublished(NOW));
        assertThrows(IllegalStateException.class, () -> outbox.scheduleRetry(NOW, "error"));
    }

    @Test
    void truncatesLongFailureDetailsToDatabaseColumnLimit() {
        OrderEventOutbox outbox = pending();
        outbox.claim(NOW, NOW.plusSeconds(30));
        outbox.scheduleRetry(NOW.plusSeconds(1), "x".repeat(2100));

        assertEquals(2000, outbox.getLastError().length());
    }

    private OrderEventOutbox pending() {
        return OrderEventOutbox.pending("event-1", "order-1", "OrderCompletionTaskEvent", 1, 2, "{}", NOW);
    }

    @Test
    void exhaustedFailuresAreRetainedUntilExplicitRedrive() {
        OrderEventOutbox entry = pending();
        for (int attempt = 0; attempt < 10; attempt++) {
            entry.claim(NOW, NOW.plusSeconds(30));
            entry.scheduleRetry(NOW.plusSeconds(1), "broker unavailable");
        }
        assertEquals(OutboxState.FAILED, entry.getState());
        assertEquals(10, entry.getAttemptCount());
        assertThrows(IllegalStateException.class, () -> entry.claim(NOW, NOW.plusSeconds(30)));
        entry.redrive(NOW);
        assertEquals(OutboxState.PENDING, entry.getState());
        assertEquals(0, entry.getAttemptCount());
        assertEquals("event-1", entry.getEventId());
        assertEquals("{}", entry.getPayload());
        assertThrows(IllegalStateException.class, () -> entry.redrive(NOW));
    }
}
