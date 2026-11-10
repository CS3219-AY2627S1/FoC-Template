package sg.edu.nus.foc.order.application;

import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;
import sg.edu.nus.foc.order.domain.Order;
import sg.edu.nus.foc.common.penalty.PenaltySystemPolicy;
import sg.edu.nus.foc.order.messagingpublisher.dto.OrderTaskEvent;
import sg.edu.nus.foc.order.messagingpublisher.dto.CourierPenaltyEventFacts;
import sg.edu.nus.foc.order.messagingpublisher.dto.OrderCompletionTaskEvent;
import sg.edu.nus.foc.order.messagingpublisher.dto.OpenOrderRefundTaskEvent;
import sg.edu.nus.foc.order.messagingpublisher.mapper.OrderTaskEventMapper;

@Component
@RequiredArgsConstructor
public class OrderTaskEventFactory {
    private final OrderTaskEventMapper mapper;
    private final CourierPenaltySequenceStore penaltySequences;

    public OrderTaskEvent penalty(String commandId, Order order, String courierId,
                                  Instant occurredAt, PenaltySystemPolicy reason) {
        PenaltySystemPolicy successfulDeliveryReward = PenaltySystemPolicy.getSuccessfulDeliveryReward();
        String type = reason == successfulDeliveryReward
                ? "PenaltyScoreDeductionEvent" : "PenaltyScoreAdditionEvent";
        byte[] identity = sg.edu.nus.foc.order.domain.CommandReceipt
                .fingerprint(type, commandId, order.getId(), courierId, reason.name())
                .getBytes(StandardCharsets.UTF_8);
        String eventId = UUID.nameUUIDFromBytes(identity).toString();
        long sequence = penaltySequences.assign(courierId, eventId);
        long resultingVersion = order.getVersion() + 1;
        CourierPenaltyEventFacts facts = new CourierPenaltyEventFacts(eventId, order.getId(), courierId,
                reason.getPenaltyAmount(), occurredAt, reason, resultingVersion, sequence);
        if (reason == successfulDeliveryReward) {
            return mapper.toPenaltyDeductionEvent(facts);
        }
        return mapper.toPenaltyAdditionEvent(facts);
    }

    public OrderCompletionTaskEvent completion(
            String commandId,
            Order order,
            String actorId,
            Instant occurredAt,
            boolean overdue,
            Instant overdueAt) {
        long resultingVersion = order.getVersion() + 1;
        return mapper.toCompletionEvent(
                eventId("OrderCompletionTaskEvent", commandId, order.getId(), actorId), order, resultingVersion, occurredAt);
    }

    public OpenOrderRefundTaskEvent openRefund(
            String commandId,
            Order order,
            String actorId,
            Instant occurredAt) {
        long resultingVersion = order.getVersion() + 1;
        return mapper.toOpenRefundEvent(
                eventId("OpenOrderRefundTaskEvent", commandId, order.getId(), actorId), order, resultingVersion, occurredAt);
    }

    public OpenOrderRefundTaskEvent openRefund(
            String commandId,
            Order order,
            Instant occurredAt) {
        long resultingVersion = order.getVersion() + 1;
        return mapper.toOpenRefundEvent(
                eventId("OpenOrderRefundTaskEvent", commandId, order.getId(), "lifecycle"), order, resultingVersion, occurredAt);
    }

    private String eventId(String eventType, String commandId, String orderId, String actorId) {
        byte[] identity = sg.edu.nus.foc.order.domain.CommandReceipt.fingerprint(eventType, commandId, orderId, actorId).getBytes(StandardCharsets.UTF_8);
        return UUID.nameUUIDFromBytes(identity).toString();
    }
}
