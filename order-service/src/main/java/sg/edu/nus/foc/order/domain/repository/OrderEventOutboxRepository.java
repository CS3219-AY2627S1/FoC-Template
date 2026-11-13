package sg.edu.nus.foc.order.domain.repository;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import sg.edu.nus.foc.order.domain.OrderEventOutbox;
import sg.edu.nus.foc.order.messagingpublisher.dto.OrderTaskEvent;

public interface OrderEventOutboxRepository {
    void enqueue(OrderTaskEvent event);

    Optional<OrderEventOutbox> claim(String eventId, Instant now, Instant leaseExpiry);

    List<String> findDueIds(Instant now, int limit);

    List<OrderEventOutbox> claimDue(Instant now, Instant leaseExpiry, int limit);

    void markPublished(String eventId, Instant publishedAt);

    void scheduleRetry(String eventId, Instant nextAttemptAt, String error);

    void redrive(String eventId, Instant now);

    List<String> failedIds(int limit);
}
