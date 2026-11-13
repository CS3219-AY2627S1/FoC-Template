package sg.edu.nus.foc.order.application;

import java.time.Instant;
import java.util.Optional;

import lombok.RequiredArgsConstructor;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import sg.edu.nus.foc.order.domain.Order;
import sg.edu.nus.foc.order.domain.OrderCheckpoint;
import sg.edu.nus.foc.order.domain.OrderStatus;
import sg.edu.nus.foc.order.domain.repository.OrderCheckpointRepository;
import sg.edu.nus.foc.order.domain.repository.OrderEventOutboxRepository;
import sg.edu.nus.foc.order.domain.repository.OrderRepository;
import sg.edu.nus.foc.order.messagingpublisher.dto.OpenOrderRefundTaskEvent;

@Service
@RequiredArgsConstructor
public class OrderExpiryProcessingService {

    private final OrderRepository orders;
    private final OrderCheckpointRepository checkpoints;
    private final OrderEventOutboxRepository outbox;
    private final ApplicationEventPublisher applicationEvents;
    private final OrderTaskEventFactory eventFactory;
    private final OrderAuditLogger audit;

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public boolean expire(String orderId, Instant now) {
        Optional<Order> candidate = orders.getForLifecycleUpdate(orderId);
        if (candidate.isEmpty()) {
            return false;
        }

        Order order = candidate.get();
        if (order.getStatus() != OrderStatus.OPEN
                || order.isCompletionHold()
                || order.getCourierId() != null
                || order.getExpiresAt().isAfter(now)) {
            return false;
        }

        order.expire(order.getVersion(), now);
        checkpoints.save(new OrderCheckpoint(order.getId(), order.getStatus(), now, "lifecycle", null));
        Order saved = orders.save(order);
        String commandId = "EXPIRE:" + saved.getId();
        OpenOrderRefundTaskEvent event = eventFactory.openRefund(commandId, saved, now);
        outbox.enqueue(event);
        applicationEvents.publishEvent(new OrderOutboxDispatchRequested(event.getEventId()));
        audit.action("EXPIRE", saved.getId(), "lifecycle", commandId, "accepted");
        return true;
    }
}
