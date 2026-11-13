package sg.edu.nus.foc.order.infrastructure;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.databind.json.JsonMapper;
import sg.edu.nus.foc.order.domain.OrderEventOutbox;
import sg.edu.nus.foc.order.domain.repository.OrderEventOutboxRepository;
import sg.edu.nus.foc.order.messagingpublisher.dto.OrderTaskEvent;

@Repository
@RequiredArgsConstructor
public class OrderEventOutboxPersistenceAdapter implements OrderEventOutboxRepository {
    private final JpaOrderEventOutboxRepository repository;
    private final JsonMapper objectMapper;

    @Override
    @Transactional
    public void enqueue(OrderTaskEvent event) {
        String payload = objectMapper.writeValueAsString(event);
        repository.save(OrderEventOutbox.pending(
                event.getEventId(),
                event.getOrderId(),
                event.getEventType(),
                event.getEventVersion(),
                event.getOrderVersion(),
                payload,
                event.getOccurredAt()));
    }

    @Override
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public Optional<OrderEventOutbox> claim(String eventId, Instant now, Instant leaseExpiry) {
        Optional<OrderEventOutbox> claimable = repository.findClaimableByIdForUpdate(eventId, now);
        claimable.ifPresent(outbox -> outbox.claim(now, leaseExpiry));
        return claimable;
    }

    @Override
    @Transactional(readOnly = true)
    public List<String> findDueIds(Instant now, int limit) {
        return repository.findDueIds(now, limit);
    }

    @Override
    @Transactional
    public List<OrderEventOutbox> claimDue(Instant now, Instant leaseExpiry, int limit) {
        List<OrderEventOutbox> entries = repository.findDueForUpdate(now, limit);
        entries.forEach(outbox -> outbox.claim(now, leaseExpiry));
        return entries;
    }

    @Override
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void markPublished(String eventId, Instant publishedAt) {
        OrderEventOutbox outbox = repository.findById(eventId).orElseThrow();
        outbox.markPublished(publishedAt);
    }

    @Override
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void scheduleRetry(String eventId, Instant nextAttemptAt, String error) {
        OrderEventOutbox outbox = repository.findById(eventId).orElseThrow();
        outbox.scheduleRetry(nextAttemptAt, error);
    }

    @Override
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void redrive(String eventId, Instant now) {
        OrderEventOutbox entry = repository.findForRedrive(eventId)
                .orElseThrow(() -> sg.edu.nus.foc.order.domain.OrderProblem.notFound("Failed event not found."));
        if (entry.getState() != sg.edu.nus.foc.order.domain.OutboxState.FAILED) {
            throw sg.edu.nus.foc.order.domain.OrderProblem.conflict("Only FAILED events may be redriven.");
        }
        entry.redrive(now);
    }

    @Override
    @Transactional(readOnly = true)
    public List<String> failedIds(int limit) {
        return repository.findFailedIds(limit);
    }
}
