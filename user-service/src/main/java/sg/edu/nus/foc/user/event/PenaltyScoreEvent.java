package sg.edu.nus.foc.user.event;

import java.time.Instant;

public record PenaltyScoreEvent(
        String eventId,
        String eventType,
        String orderId,
        String courierId,
        int penaltyAmount,
        Instant occurredAt,
        String appliedReason,
        Long courierSequence
) {
    public PenaltyScoreEvent(String eventId, String eventType, String orderId, String courierId,
            int penaltyAmount, Instant occurredAt, String appliedReason) {
        this(eventId, eventType, orderId, courierId, penaltyAmount, occurredAt, appliedReason, null);
    }
}
