package sg.edu.nus.foc.order.domain;

import jakarta.persistence.Embeddable;
import jakarta.persistence.Column;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

@Embeddable
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class RepostPlan {
    private boolean enabled;
    private Instant dueAt;
    @Column(name = "repost_expires_at")
    private Instant expiresAt;
    private long creditAmount;
    private int deliveryDurationMinutes;
    private boolean used;

    public RepostPlan(boolean enabled, Instant dueAt, long creditAmount, int deliveryDurationMinutes, Instant expiresAt) {
        if (enabled) {
            List<OrderProblem.Detail> errors = new ArrayList<>();
            if (dueAt == null) errors.add(new OrderProblem.Detail("repostDueAt", "Choose a repost time when automatic repost is enabled."));
            if (expiresAt == null) errors.add(new OrderProblem.Detail("repostExpiresAt", "Choose a repost expiry when automatic repost is enabled."));
            else if (dueAt != null && expiresAt.isBefore(dueAt.plus(Order.MINIMUM_POSTING_WINDOW))) errors.add(new OrderProblem.Detail("repostExpiresAt", "Repost expiry must be at least 30 minutes after the repost time."));
            if (creditAmount < 1) errors.add(new OrderProblem.Detail("repostCreditAmount", "Repost credits must be at least 1."));
            if (deliveryDurationMinutes < 15) errors.add(new OrderProblem.Detail("repostDeliveryDurationMinutes", "Repost delivery time must be at least 15 minutes."));
            if (!errors.isEmpty()) throw new OrderProblem("VALIDATION_ERROR", String.join(" ", errors.stream().map(OrderProblem.Detail::getMessage).toList()), errors);
        }
        this.enabled = enabled;
        this.dueAt = dueAt;
        this.expiresAt = expiresAt;
        this.creditAmount = creditAmount;
        this.deliveryDurationMinutes = deliveryDurationMinutes;
    }

    public boolean isDueAt(Instant now) {
        return dueAt != null && !dueAt.isAfter(now);
    }

    public void validateAgainst(Instant originalExpiry) {
        if (enabled && (dueAt == null || dueAt.isBefore(originalExpiry) || expiresAt == null
                || !expiresAt.isAfter(dueAt))) {
            throw new OrderProblem("VALIDATION_ERROR",
                    "Repost time must be at or after the original order expiry.",
                    List.of(new OrderProblem.Detail("repostDueAt", "Repost time must be at or after the original order expiry.")));
        }
    }

    public boolean hasFutureExpiry(Instant now) {
        return expiresAt != null && expiresAt.isAfter(now);
    }

    public void markUsed() {
        used = true;
    }
}
