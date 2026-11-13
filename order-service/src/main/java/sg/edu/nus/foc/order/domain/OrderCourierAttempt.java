package sg.edu.nus.foc.order.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Enumerated;
import jakarta.persistence.EnumType;
import sg.edu.nus.foc.common.penalty.PenaltySystemPolicy;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.UUID;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.Immutable;

/** Immutable courier-owned view of an aborted attempt, not another active Order. */
@Entity
@Immutable
@Table(name = "order_courier_attempts")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class OrderCourierAttempt {
    @Id
    private UUID id;
    @Column(nullable = false, length = 36)
    private String orderId;
    @Column(nullable = false, length = 128)
    private String requesterId;
    @Column(nullable = false, length = 128)
    private String courierId;
    @Column(nullable = false, length = 100)
    private String itemDescription;
    @Column(nullable = false, length = 128)
    private String pickupSupplierId;
    @Column(nullable = false, length = 128)
    private String deliverySupplierId;
    @Column(nullable = false)
    private long offeredCredits;
    @Column(nullable = false)
    private int deliveryTimeLimitMinutes;
    @Column(nullable = false)
    private Instant createdAt;
    @Column(nullable = false)
    private Instant expiresAt;
    @Column(nullable = false)
    private Instant abortedAt;
    @Column(nullable = false)
    private long orderVersion;
    @Column(length = 36)
    private String originalOrderId;
    @Column(length = 36)
    private String repostedOrderId;

    @Enumerated(EnumType.STRING)
    @Column(length = 64)
    private PenaltySystemPolicy appliedPenalty;
    private Instant appliedPenaltyAt;
    @Column(length = 128)
    private String appliedPenaltyBy;
    @Column(length = 1000)
    private String appliedPenaltyReason;

    public OrderCourierAttempt(Order order, String courier, long expectedVersion, Instant abortedAt) {
        order.validateAcceptedCancellation(courier, expectedVersion);
        this.id = order.ensureCourierAssignmentId();
        this.orderId = order.getId();
        this.requesterId = order.getRequesterId();
        this.courierId = courier;
        this.appliedPenalty = order.getAppliedPenalty();
        this.appliedPenaltyAt = order.getAppliedPenaltyAt();
        this.appliedPenaltyBy = order.getAppliedPenaltyBy();
        this.appliedPenaltyReason = order.getAppliedPenaltyReason();
        this.itemDescription = order.getItemDescription();
        this.pickupSupplierId = order.getPickupSupplierId();
        this.deliverySupplierId = order.getDeliverySupplierId();
        this.offeredCredits = order.getOfferedCredits();
        this.deliveryTimeLimitMinutes = order.getDeliveryTimeLimitMinutes();
        this.createdAt = order.getCreatedAt();
        this.expiresAt = order.getExpiresAt();
        this.abortedAt = abortedAt;
        this.orderVersion = order.getVersion();
        this.originalOrderId = order.getOriginalOrderId();
        this.repostedOrderId = order.getRepostedOrderId();
    }
}
