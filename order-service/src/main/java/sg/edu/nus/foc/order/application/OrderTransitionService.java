package sg.edu.nus.foc.order.application;

import java.time.Instant;
import java.util.Optional;
import lombok.RequiredArgsConstructor;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import sg.edu.nus.foc.order.domain.CommandReceipt;
import sg.edu.nus.foc.order.domain.Order;
import sg.edu.nus.foc.order.domain.OrderCheckpoint;
import sg.edu.nus.foc.order.domain.OrderCourierAttempt;
import sg.edu.nus.foc.order.domain.OrderProblem;
import sg.edu.nus.foc.order.domain.OrderStatus;
import sg.edu.nus.foc.order.domain.repository.CommandReceiptRepository;
import sg.edu.nus.foc.order.domain.repository.OrderCheckpointRepository;
import sg.edu.nus.foc.order.domain.repository.OrderRepository;
import sg.edu.nus.foc.order.domain.repository.OrderEventOutboxRepository;
import sg.edu.nus.foc.common.penalty.PenaltySystemPolicy;
import sg.edu.nus.foc.order.messagingpublisher.dto.OrderTaskEvent;
import sg.edu.nus.foc.order.messagingpublisher.dto.OrderCompletionTaskEvent;
import sg.edu.nus.foc.order.messagingpublisher.dto.OpenOrderRefundTaskEvent;

@Service
@RequiredArgsConstructor
public class OrderTransitionService {
    private final OrderRepository orders;
    private final OrderCheckpointRepository checkpoints;
    private final CommandReceiptRepository receipts;
    private final UserServicePort users;
    private final CreditServicePort credits;
    private final OrderEventOutboxRepository outbox;
    private final ApplicationEventPublisher applicationEvents;
    private final OrderTaskEventFactory eventFactory;
    private final OrderAuditLogger audit;
    private final PenaltyOutcomeRecorder penaltyOutcomes;

    @Transactional
    public Order start(String commandId, String id, String actor, long version, String authorization) {
        return courier("START", commandId, id, actor, version, authorization, Order::start);
    }

    @Transactional
    public Order pickup(String commandId, String id, String actor, long version, String authorization) {
        return courier("PICKUP", commandId, id, actor, version, authorization,
                (order, courier, expectedVersion, occurredAt) -> order.markPickedUp(courier, expectedVersion));
    }

    @Transactional
    public Order deliver(String commandId, String id, String actor, long version, String authorization) {
        return courier("DELIVER", commandId, id, actor, version, authorization, Order::markDelivered);
    }

    @Transactional
    public Order complete(String commandId, String id, String actor, long version, String authorization) {
        String authenticatedActor = users.verifyRequester(actor, authorization);
        Optional<CommandReceipt> previous = receipts.findExisting("COMPLETE", commandId);
        if (previous.isPresent()) {
            previous.get().requireBinding(id, authenticatedActor, CommandReceipt.fingerprint("COMPLETE", id, authenticatedActor, version));
            return orders.get(previous.get().getOrderId()).orElseThrow();
        }

        Order order = findForUpdate(id);
        order.validateCompletion(authenticatedActor, version);
        Instant completedAt = Instant.now();
        return persistCompletion(
                "COMPLETE", commandId, order, authenticatedActor, completedAt, version, false);
    }

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public boolean autoComplete(String id, Instant completedAt) {
        String commandId = "AUTO_COMPLETE:" + id;
        Optional<CommandReceipt> previous = receipts.findExisting("AUTO_COMPLETE", commandId);
        if (previous.isPresent()) {
            return false;
        }

        Order order = orders.getForLifecycleUpdate(id)
                .orElseThrow(() -> OrderProblem.notFound("Order not found."));
        if (order.getStatus() != OrderStatus.DELIVERED || order.isCompletionHold()) {
            return false;
        }

        Instant deliveredAt = order.getDeliveredAt();
        if (deliveredAt == null || order.getDeliveryDeadlineAt() == null
                || deliveredAt.plus(Order.AUTOMATIC_COMPLETION_DELAY).isAfter(completedAt)) {
            return false;
        }

        persistCompletion(
                "AUTO_COMPLETE",
                commandId,
                order,
                "lifecycle",
                completedAt,
                order.getVersion(),
                true);
        return true;
    }

    @Transactional
    public Order cancel(String commandId, String id, String actor, long version, String authorization) {
        String authenticatedActor = users.verifyRequester(actor, authorization);
        Optional<CommandReceipt> previous = receipts.findExisting("CANCEL", commandId);
        if (previous.isPresent()) {
            previous.get().requireBinding(id, authenticatedActor, CommandReceipt.fingerprint("CANCEL", id, authenticatedActor, version));
            return orders.get(previous.get().getOrderId()).orElseThrow();
        }

        Order order = findForUpdate(id);
        order.validateOpenCancellation(authenticatedActor, version);
        Instant cancelledAt = Instant.now();
        order.cancelOpen(authenticatedActor, version);
        checkpoints.save(new OrderCheckpoint(
                order.getId(),
                OrderStatus.CANCELLED,
                cancelledAt,
                authenticatedActor,
                null));
        Order saved = orders.save(order);
        receipts.save(new CommandReceipt("CANCEL", commandId, saved.getId(), cancelledAt)
                .bind(authenticatedActor, CommandReceipt.fingerprint("CANCEL", id, authenticatedActor, version)));
        OpenOrderRefundTaskEvent event = eventFactory.openRefund(
                commandId, saved, authenticatedActor, cancelledAt);
        outbox.enqueue(event);
        applicationEvents.publishEvent(new OrderOutboxDispatchRequested(event.getEventId()));
        audit.action("CANCEL", saved.getId(), authenticatedActor, commandId, "accepted");
        return saved;
    }

    @Transactional
    public Order cancelAccepted(String commandId, String id, String actor, long version, String authorization) {
        return cancelAcceptedInternal(commandId, id, actor, version, authorization, false);
    }

    @Transactional
    public Order abortConfirmed(String commandId, String id, String actor, long version, String authorization) {
        return cancelAcceptedInternal(commandId, id, actor, version, authorization, true);
    }

    private Order cancelAcceptedInternal(String commandId, String id, String actor, long version,
                                         String authorization, boolean confirmed) {
        String authenticatedActor = users.verifyCourier(actor, authorization);
        Optional<CommandReceipt> previous = receipts.findExisting("CANCEL_ACCEPTED", commandId);
        if (previous.isPresent()) {
            previous.get().requireBinding(id, authenticatedActor, CommandReceipt.fingerprint("CANCEL_ACCEPTED", id, authenticatedActor, version));
            return orders.get(previous.get().getOrderId()).orElseThrow();
        }

        Order order = findForUpdate(id);
        order.validateAcceptedCancellation(authenticatedActor, version);
        PenaltySystemPolicy finalPenalty = Order.higherPenalty(order.getAppliedPenalty(), PenaltySystemPolicy.ACCEPTED_TASK_CANCELLATION);
        if (!confirmed) credits.holdForReopen(order.getId(), authorization);
        Instant cancelledAt = Instant.now();
        orders.saveAbortedAttempt(new OrderCourierAttempt(order, authenticatedActor, version, cancelledAt));
        checkpoints.save(new OrderCheckpoint(
                order.getId(),
                OrderStatus.ABORTED,
                cancelledAt,
                authenticatedActor,
                null));
        if (cancelledAt.isBefore(order.getExpiresAt())) {
            order.reopenAfterAcceptedCancellation(authenticatedActor, version, cancelledAt);
        } else {
            order.abortAfterAcceptedCancellation(authenticatedActor, version, cancelledAt);
        }
        checkpoints.save(new OrderCheckpoint(order.getId(), order.getStatus(), cancelledAt, authenticatedActor, null));
        Order saved = orders.save(order);
        receipts.save(new CommandReceipt("CANCEL_ACCEPTED", commandId, saved.getId(), cancelledAt)
                .bind(authenticatedActor, CommandReceipt.fingerprint("CANCEL_ACCEPTED", id, authenticatedActor, version)));
        OrderTaskEvent event = eventFactory.penalty(
                commandId, saved, authenticatedActor, cancelledAt, finalPenalty);
        penaltyOutcomes.record(saved, authenticatedActor, finalPenalty, event.getEventId(), cancelledAt, authenticatedActor, "Accepted task cancellation");
        outbox.enqueue(event);
        applicationEvents.publishEvent(new OrderOutboxDispatchRequested(event.getEventId()));
        if (saved.getStatus() == OrderStatus.EXPIRED) {
            OpenOrderRefundTaskEvent refund = eventFactory.openRefund(commandId, saved, authenticatedActor, cancelledAt);
            outbox.enqueue(refund);
            applicationEvents.publishEvent(new OrderOutboxDispatchRequested(refund.getEventId()));
        }
        audit.action("CANCEL_ACCEPTED", saved.getId(), authenticatedActor, commandId, "accepted");
        return saved;
    }

    private Order courier(
            String operation,
            String commandId,
            String id,
            String actor,
            long version,
            String authorization,
            OrderTransition action) {
        String authenticatedActor = users.verifyCourier(actor, authorization);
        return apply(operation, commandId, id, authenticatedActor, version, action, true);
    }

    private Order apply(
            String operation,
            String commandId,
            String id,
            String actor,
            long version,
            OrderTransition action,
            boolean checkpointRequired) {
        Optional<CommandReceipt> previous = receipts.findExisting(operation, commandId);
        if (previous.isPresent()) {
            previous.get().requireBinding(id, actor, CommandReceipt.fingerprint(operation, id, actor, version));
            return orders.get(previous.get().getOrderId()).orElseThrow();
        }

        Order order = findForUpdate(id);
        Instant occurredAt = Instant.now();
        action.apply(order, actor, version, occurredAt);

        if (checkpointRequired) {
            checkpoints.save(new OrderCheckpoint(
                    order.getId(),
                    order.getStatus(),
                    occurredAt,
                    actor,
                    null));
        }

        Order saved = orders.save(order);
        receipts.save(new CommandReceipt(operation, commandId, saved.getId(), occurredAt)
                .bind(actor, CommandReceipt.fingerprint(operation, id, actor, version)));
        return saved;
    }

    private Order persistCompletion(
            String operation,
            String commandId,
            Order order,
            String actorId,
            Instant completedAt,
            long expectedVersion,
            boolean automatic) {
        Instant overdueAt = order.getDeliveryDeadlineAt();
        Instant deliveredAt = order.getDeliveredAt();
        if (overdueAt == null || deliveredAt == null || order.getOverdue() == null) {
            throw OrderProblem.conflict("Delivery timing is unavailable. This order requires timing reconciliation before completion.");
        }
        boolean overdue = Boolean.TRUE.equals(order.getOverdue());

        if (automatic) {
            order.completeAutomatically(expectedVersion);
        } else {
            order.confirmCompletion(actorId, expectedVersion);
        }

        checkpoints.save(new OrderCheckpoint(
                order.getId(),
                OrderStatus.COMPLETED,
                completedAt,
                actorId,
                null));
        Order saved = orders.save(order);
        receipts.save(new CommandReceipt(operation, commandId, saved.getId(), completedAt)
                .bind(actorId, CommandReceipt.fingerprint(operation, order.getId(), actorId, expectedVersion)));

        OrderCompletionTaskEvent event = eventFactory.completion(
                commandId,
                saved,
                actorId,
                completedAt,
                overdue,
                overdueAt);
        PenaltySystemPolicy finalPolicy = saved.penaltyAtCompletion();
        OrderTaskEvent penalty = finalPolicy == null ? null
                : eventFactory.penalty(commandId, saved, saved.getCourierId(), completedAt, finalPolicy);
        penaltyOutcomes.record(saved, saved.getCourierId(), finalPolicy, penalty == null ? null : penalty.getEventId(), completedAt, actorId, automatic ? "Automatic completion" : "Requester completion");
        outbox.enqueue(event);
        if (penalty != null) outbox.enqueue(penalty);
        applicationEvents.publishEvent(new OrderOutboxDispatchRequested(event.getEventId()));
        if (penalty != null) applicationEvents.publishEvent(new OrderOutboxDispatchRequested(penalty.getEventId()));
        audit.action(operation, saved.getId(), actorId, commandId, "accepted");
        return saved;
    }

    private Order findForUpdate(String id) {
        return orders.getForUpdate(id)
                .orElseThrow(() -> OrderProblem.notFound("Order not found."));
    }

    @FunctionalInterface
    private interface OrderTransition {
        void apply(Order order, String actor, Long version, Instant occurredAt);
    }
}
