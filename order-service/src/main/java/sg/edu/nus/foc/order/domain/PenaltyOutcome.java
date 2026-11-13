package sg.edu.nus.foc.order.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.Version;
import java.time.Instant;
import java.util.Objects;
import java.util.UUID;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;
import sg.edu.nus.foc.common.penalty.PenaltySystemPolicy;

@Entity
@Table(name = "order_penalty_outcomes")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class PenaltyOutcome {
    @Id private UUID id;
    @Column(nullable = false, length = 36) private String orderId;
    @Column(nullable = false, length = 128) private String courierId;
    @Column(length = 36, unique = true) private String initialEventId;
    @Enumerated(EnumType.STRING) @Column(length = 64) private PenaltySystemPolicy initialPolicy;
    @Column(nullable = false) private int initialSignedAmount;
    @Enumerated(EnumType.STRING) @Column(length = 64) private PenaltySystemPolicy policy;
    @Column(nullable = false) private int signedAmount;
    @Column(nullable = false) private long revision;
    @Column(nullable = false) private Instant createdAt;
    @Column(nullable = false) private Instant updatedAt;
    @Column(nullable = false, length = 128) private String requestedBy;
    @Column(nullable = false, length = 1000) private String reason;
    @Column(nullable = false) private boolean confirmed;
    @Version private long version;

    public PenaltyOutcome(UUID attemptId, String orderId, String courierId, PenaltySystemPolicy policy,
            String initialEventId, Instant now, String actor, String reason) {
        this.id = Objects.requireNonNull(attemptId);
        this.orderId = orderId;
        this.courierId = courierId;
        this.initialEventId = initialEventId;
        this.initialPolicy = policy;
        this.initialSignedAmount = amount(policy);
        this.policy = policy;
        this.signedAmount = initialSignedAmount;
        this.createdAt = now;
        this.updatedAt = now;
        this.requestedBy = actor;
        this.reason = requireReason(reason);
    }

    public static int amount(PenaltySystemPolicy policy) {
        if (policy == null) return 0;
        return policy == PenaltySystemPolicy.SUCCESSFUL_DELIVERY ? -policy.getPenaltyAmount() : policy.getPenaltyAmount();
    }

    public static String requireReason(String text) {
        if (text == null || text.isBlank() || text.length() > 1000) {
            throw new OrderProblem("VALIDATION_ERROR", "A reason of 1 through 1000 characters is required.");
        }
        return text.strip();
    }
}
