package sg.edu.nus.foc.order.application;

import java.time.Instant;
import java.util.EnumSet;
import java.util.List;
import java.util.Optional;

import lombok.RequiredArgsConstructor;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import sg.edu.nus.foc.common.penalty.PenaltySystemPolicy;
import sg.edu.nus.foc.order.domain.CommandReceipt;
import sg.edu.nus.foc.order.domain.Order;
import sg.edu.nus.foc.order.domain.OrderCheckpoint;
import sg.edu.nus.foc.order.domain.OrderProblem;
import sg.edu.nus.foc.order.domain.OrderStatus;
import sg.edu.nus.foc.order.domain.repository.CommandReceiptRepository;
import sg.edu.nus.foc.order.domain.repository.OrderCheckpointRepository;
import sg.edu.nus.foc.order.domain.repository.OrderEventOutboxRepository;
import sg.edu.nus.foc.order.domain.repository.OrderRepository;
import sg.edu.nus.foc.order.messagingpublisher.dto.OrderTaskEvent;

@Service
@RequiredArgsConstructor
public class AdminOrderCancellationService {

    private static final String OPERATION = "ADMIN_CANCEL";
    private final OrderRepository orders;
    private final OrderCheckpointRepository checkpoints;
    private final CommandReceiptRepository receipts;
    private final OrderEventOutboxRepository outbox;
    private final ApplicationEventPublisher signals;
    private final OrderTaskEventFactory eventFactory;
    private final OrderAuditLogger audit;
    private final PenaltyOutcomeRecorder penaltyOutcomes;

    @Transactional
    public Order cancel(String orderId, String requesterId, String courierId,
                        List<PenaltySystemPolicy> appliedPenalties, String adminId) {
        return cancel(orderId, requesterId, courierId, appliedPenalties, adminId, null);
    }

    @Transactional
    public Order cancel(String orderId, String requesterId, String courierId,
                          List<PenaltySystemPolicy> appliedPenalties, String adminId, String resolutionReason) {
        String explanation = Order.normalizeAdminResolutionReason(resolutionReason);
        EnumSet<PenaltySystemPolicy> penalties = normalize(appliedPenalties);
        Order order = orders.getForLifecycleUpdate(orderId)
                .orElseThrow(() -> OrderProblem.notFound("Order not found."));
        String commandId = OPERATION + ":" + orderId;
        // Keep legacy no-reason fingerprints byte-for-byte compatible.
        String binding = explanation == null
                ? CommandReceipt.fingerprint(OPERATION, orderId, adminId, requesterId, courierId, penalties)
                : CommandReceipt.fingerprint(OPERATION, orderId, adminId, requesterId, courierId, penalties, explanation);
        Optional<CommandReceipt> previous = receipts.findExisting(OPERATION, commandId);
        if (previous.isPresent()) {
            previous.get().requireBinding(orderId, adminId, binding);
            return order;
        }
        if (!penalties.isEmpty() && order.getCourierId() == null) {
            throw new OrderProblem("VALIDATION_ERROR", "A courier must be assigned before applying a courier penalty.");
        }
        PenaltySystemPolicy highest = null;
        for (PenaltySystemPolicy candidate : penalties) {
            if (highest == null || candidate.getPenaltyAmount() > highest.getPenaltyAmount()) {
                highest = candidate;
            }
        }
        // An explicit no-penalty cancellation overrides stored scoring; keep the stored audit.
        // A selected addition still competes with the stored policy, never automatic overdue.
        if (highest != null) highest = Order.higherPenalty(order.getAppliedPenalty(), highest);
        Instant cancelledAt = Instant.now();
        order.cancelByAdmin(requesterId, courierId, cancelledAt, highest, explanation);
        checkpoints.save(new OrderCheckpoint(orderId, OrderStatus.CANCELLED, cancelledAt, adminId, null));
        Order saved = orders.save(order);
        receipts.save(new CommandReceipt(OPERATION, commandId, orderId, cancelledAt).bind(adminId, binding));
        OrderTaskEvent refund = eventFactory.openRefund(commandId, saved, adminId, cancelledAt);
        outbox.enqueue(refund);
        OrderTaskEvent penalty = null;
        if (highest != null) {
            penalty = eventFactory.penalty(commandId, saved, saved.getCourierId(), cancelledAt, highest);
            outbox.enqueue(penalty);
        }
        penaltyOutcomes.record(saved, saved.getCourierId(), highest, penalty == null ? null : penalty.getEventId(), cancelledAt, adminId, explanation == null ? "Administrator resolution" : explanation);
        // All durable writes precede the existing AFTER_COMMIT dispatch signals.
        signals.publishEvent(new OrderOutboxDispatchRequested(refund.getEventId()));
        if (penalty != null) {
            signals.publishEvent(new OrderOutboxDispatchRequested(penalty.getEventId()));
        }
        audit.action(OPERATION, orderId, adminId, commandId, "accepted");
        return saved;
    }

    private EnumSet<PenaltySystemPolicy> normalize(List<PenaltySystemPolicy> requested) {
        EnumSet<PenaltySystemPolicy> result = EnumSet.noneOf(PenaltySystemPolicy.class);
        if (requested == null) {
            return result;
        }
        for (PenaltySystemPolicy penalty : requested) {
            if (penalty == null || !PenaltySystemPolicy.getFullPenaltyPolicy().contains(penalty) || penalty == PenaltySystemPolicy.getSuccessfulDeliveryReward()) {
                throw new OrderProblem("VALIDATION_ERROR", "Only penalty addition cases may be applied to cancellation.");
            }
            result.add(penalty);
        }
        return result;
    }
}
