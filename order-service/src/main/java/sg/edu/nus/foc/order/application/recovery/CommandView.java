package sg.edu.nus.foc.order.application.recovery;

import java.time.Instant;
import sg.edu.nus.foc.order.api.dto.response.OrderResponse;

/** Safe owner-facing status: no lease, hash, credentials or raw peer diagnostics. */
public record CommandView(String commandId, String kind, String status, String outcome, String reason,
                          String message, String orderId, int attemptCount,
                          Instant nextRetryAt, OrderResponse result, DisplayDetails displayDetails) {
    public CommandView(String commandId, String kind, String status, String outcome, String reason,
            String message, String orderId, int attemptCount, Instant nextRetryAt, OrderResponse result) {
        this(commandId, kind, status, outcome, reason, message, orderId, attemptCount, nextRetryAt, result, null);
    }
    /** Allow-listed projection, never a raw command input or authorization credential. */
    public record DisplayDetails(String itemDescription, String pickupSupplierId, String deliverySupplierId,
            long offeredCredits, int deliveryTimeLimitMinutes, Instant expiresAt, String orderStatus, Long version) { }
}
