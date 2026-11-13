package sg.edu.nus.foc.credit.credit;

import java.time.Instant;

public record CreditOutcomeEvent(
        String eventId,
        CreditOutcomeType type,
        String orderId,
        String orderStatus,
        long creditAmount,
        Instant occurredAt,
        String courierId) {
}
