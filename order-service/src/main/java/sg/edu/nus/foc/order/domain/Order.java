package sg.edu.nus.foc.order.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Embedded;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.Transient;
import jakarta.persistence.UniqueConstraint;
import jakarta.persistence.Version;
import java.time.Duration;
import java.time.Instant;
import java.util.UUID;
import java.util.ArrayList;
import java.util.List;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;
import sg.edu.nus.foc.common.penalty.PenaltySystemPolicy;

@Entity
@Table(name = "orders", uniqueConstraints = @UniqueConstraint(name = "ux_order_repost_original", columnNames = "original_order_id"))
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class Order {
    public static final Duration MINIMUM_POSTING_WINDOW = Duration.ofMinutes(30);
    public static final Duration AUTOMATIC_COMPLETION_DELAY = Duration.ofHours(48);

    @Id
    @Column(name = "row_id", nullable = false)
    private UUID rowId;
    @Column(nullable = false, unique = true, length = 36)
    private String id;
    @Transient
    private UUID attemptId;
    @Column(nullable = false, length = 128)
    private String requesterId;
    @Column(length = 128)
    private String courierId;
    private UUID courierAssignmentId;
    @Enumerated(EnumType.STRING)
    @Column(length = 64)
    private PenaltySystemPolicy appliedPenalty;
    private Instant appliedPenaltyAt;
    @Column(length = 128)
    private String appliedPenaltyBy;
    @Column(length = 1000)
    private String appliedPenaltyReason;

    @Column(nullable = false, length = 100)
    private String itemDescription;
    @Column(nullable = false, length = 128)
    private String pickupSupplierId;
    @Column(nullable = false, length = 128)
    private String deliverySupplierId;
    @Column(nullable = false)
    private long offeredCredits;
    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private OrderStatus status;
    @Column(name = "completion_hold", nullable = false)
    private boolean completionHold;
    @Column(nullable = false)
    private Instant createdAt;
    @Column(nullable = false)
    private Instant expiresAt;
    @Column(nullable = false)
    private int deliveryTimeLimitMinutes;
    private Instant deliveryDeadlineAt;
    private Instant deliveredAt;
    private Boolean deliveryOverdue;
    @Column(nullable = false)
    private boolean overduePenaltyWaived;
    private Instant overdueWaivedAt;
    @Column(length = 128)
    private String overdueWaivedBy;
    @Column(length = 1000)
    private String overdueWaiverReason;
    @Enumerated(EnumType.STRING)
    @Column(length = 24)
    private AdminPenaltyDecision adminPenaltyDecision;
    @Enumerated(EnumType.STRING)
    @Column(length = 64)
    private PenaltySystemPolicy adminPenaltyReason;
    private Integer adminPenaltyAmount;
    private Instant adminResolutionAt;
    @Column(length = 1000)
    private String adminResolutionReason;
    @Version
    private long version;
    @Column(name = "original_order_id", length = 36)
    private String originalOrderId;
    @Column(name = "reposted_order_id", length = 36)
    private String repostedOrderId;
    @Embedded
    private RepostPlan repostPlan;
    @Column(length = 40)
    private String repostFailureCode;
    @Column(length = 256)
    private String repostFailureMessage;
    private Instant repostFailureAt;

    private Order(String id, String requesterId, String description, String pickup, String delivery,
                   long credits, int duration, Instant createdAt, Instant expiresAt, String originalOrderId) {
        this.rowId = UUID.randomUUID();
        this.id = id;
        this.requesterId = requesterId;
        this.itemDescription = description;
        this.pickupSupplierId = pickup;
        this.deliverySupplierId = delivery;
        this.offeredCredits = credits;
        this.deliveryTimeLimitMinutes = duration;
        this.createdAt = createdAt;
        this.expiresAt = expiresAt;
        this.originalOrderId = originalOrderId;
        this.status = OrderStatus.OPEN;
    }

    public static Order open(String requesterId, String description, String pickup, String delivery,
                             long credits, int duration, Instant createdAt, Instant expiresAt) {
        return open(requesterId, description, pickup, delivery, credits, duration, createdAt, expiresAt, null);
    }

    public static Order open(String requesterId, String description, String pickup, String delivery,
                             long credits, int duration, Instant createdAt, Instant expiresAt, RepostPlan repostPlan) {
        return openWithId(UUID.randomUUID().toString(), requesterId, description, pickup, delivery,
                credits, duration, createdAt, expiresAt, repostPlan);
    }

    /** Durable creation retries use the candidate business ID saved before Credit I/O. */
    public static Order openWithId(String candidateId, String requesterId, String description, String pickup, String delivery,
                             long credits, int duration, Instant createdAt, Instant expiresAt, RepostPlan repostPlan) {
        UUID.fromString(candidateId);
        List<OrderProblem.Detail> errors = new ArrayList<>();
        if (requesterId == null || requesterId.isBlank()) errors.add(new OrderProblem.Detail("requesterId", "A verified requester is required."));
        validateRepostFields(description, credits, duration, createdAt.plus(MINIMUM_POSTING_WINDOW), expiresAt, errors);
        if (pickup == null || pickup.isBlank()) errors.add(new OrderProblem.Detail("pickupSupplierId", "Select a pickup supplier."));
        if (delivery == null || delivery.isBlank()) errors.add(new OrderProblem.Detail("deliverySupplierId", "Select a delivery supplier."));
        else if (delivery.equals(pickup)) errors.add(new OrderProblem.Detail("deliverySupplierId", "Delivery supplier must differ from pickup supplier."));
        rejectInvalidFields(errors);
        Order order = new Order(candidateId, requesterId, description, pickup, delivery,
                credits, duration, createdAt, expiresAt, null);
        if (repostPlan != null) {
            repostPlan.validateAgainst(expiresAt);
        }
        order.repostPlan = repostPlan;
        return order;
    }

    public void accept(String courierId, long expectedVersion, Instant now) {
        validateAcceptance(courierId, expectedVersion, now);
        this.courierId = courierId;
        this.courierAssignmentId = UUID.randomUUID();
        clearAppliedPenalty();
        this.deliveryDeadlineAt = null;
        this.deliveredAt = null;
        this.status = OrderStatus.ACCEPTED;
    }

    public void applyPenalty(String expectedCourier, long expectedVersion, PenaltySystemPolicy policy,
            String adminId, String reason, Instant now) {
        requireVersion(expectedVersion);
        if (courierId == null || !courierId.equals(expectedCourier)) throw OrderProblem.conflict("The assigned courier changed.");
        if (status != OrderStatus.ACCEPTED && status != OrderStatus.IN_PROGRESS
                && status != OrderStatus.PICKED_UP && status != OrderStatus.DELIVERED) {
            throw OrderProblem.conflict("Penalties can only be recorded for assigned active orders.");
        }
        if (policy == null || !PenaltySystemPolicy.getCourierPenaltyCases().contains(policy)) {
            throw new OrderProblem("VALIDATION_ERROR", "Choose a report penalty; it cannot be cleared or replaced with a reward.");
        }
        String explanation = normalizeAdminResolutionReason(reason);
        if (explanation == null || adminId == null || adminId.isBlank() || adminId.length() > 128) {
            throw new OrderProblem("VALIDATION_ERROR", "Administrator and penalty reason are required.");
        }
        if (appliedPenalty == null || policy.getPenaltyAmount() > appliedPenalty.getPenaltyAmount()) {
            appliedPenalty = policy;
            appliedPenaltyAt = java.util.Objects.requireNonNull(now);
            appliedPenaltyBy = adminId;
            appliedPenaltyReason = explanation;
        }
    }

    public int getAppliedPenaltyAmount() {
        return appliedPenalty == null ? 0 : appliedPenalty.getPenaltyAmount();
    }

    public PenaltySystemPolicy penaltyAtCompletion() {
        PenaltySystemPolicy overduePenalty = Boolean.TRUE.equals(deliveryOverdue) && !overduePenaltyWaived
                ? PenaltySystemPolicy.OVERDUE_DELIVERY : null;
        PenaltySystemPolicy highest = higherPenalty(appliedPenalty, overduePenalty);
        if (highest != null) return highest;
        // Preserve previously persisted historical waivers without granting a reward for a late delivery.
        return Boolean.TRUE.equals(deliveryOverdue) ? null : PenaltySystemPolicy.getSuccessfulDeliveryReward();
    }

    public static PenaltySystemPolicy higherPenalty(PenaltySystemPolicy first, PenaltySystemPolicy second) {
        if (first == null) return second;
        return second != null && second.getPenaltyAmount() > first.getPenaltyAmount() ? second : first;
    }

    private void clearAppliedPenalty() {
        appliedPenalty = null;
        appliedPenaltyAt = null;
        appliedPenaltyBy = null;
        appliedPenaltyReason = null;
    }

    public UUID ensureCourierAssignmentId() {
        if (courierAssignmentId == null) courierAssignmentId = UUID.randomUUID();
        return courierAssignmentId;
    }

    public void validateAcceptance(String courierId, long expectedVersion, Instant now) {
        requireVersion(expectedVersion);
        requireStatus(OrderStatus.OPEN);
        if (requesterId.equals(courierId)) {
            throw OrderProblem.forbidden("Requester cannot accept their own order.");
        }
        if (this.courierId != null) {
            throw OrderProblem.conflict("Order already has an assigned courier.");
        }
        if (!now.isBefore(expiresAt)) {
            throw OrderProblem.conflict("Order has expired.");
        }
        if (courierId == null || courierId.isBlank()) {
            throw new OrderProblem("VALIDATION_ERROR", "Courier is required.");
        }
    }

    public void start(String courierId, long expectedVersion) {
        start(courierId, expectedVersion, Instant.now());
    }

    public void start(String courierId, long expectedVersion, Instant startedAt) {
        Instant deadline = startedAt.plusSeconds(deliveryTimeLimitMinutes * 60L);
        progress(courierId, expectedVersion, OrderStatus.ACCEPTED, OrderStatus.IN_PROGRESS);
        deliveryDeadlineAt = deadline;
    }

    public void markPickedUp(String courierId, long expectedVersion) {
        progress(courierId, expectedVersion, OrderStatus.IN_PROGRESS, OrderStatus.PICKED_UP);
    }

    public void markDelivered(String courierId, long expectedVersion) {
        markDelivered(courierId, expectedVersion, Instant.now());
    }

    public void markDelivered(String courierId, long expectedVersion, Instant deliveredAt) {
        java.util.Objects.requireNonNull(deliveredAt);
        progress(courierId, expectedVersion, OrderStatus.PICKED_UP, OrderStatus.DELIVERED);
        this.deliveredAt = deliveredAt;
        this.deliveryOverdue = deliveryDeadlineAt == null ? null : deliveredAt.isAfter(deliveryDeadlineAt);
    }

    @Transient
    public Boolean getOverdue() {
        return attemptId == null ? deliveryOverdue : null;
    }

    public Boolean overdueAt(Instant observedAt) {
        return getOverdue();
    }

    public void waiveOverdue(String adminId, String reason, Instant now) {
        String explanation = normalizeAdminResolutionReason(reason);
        if (explanation == null || adminId == null || adminId.isBlank() || adminId.length() > 128) {
            throw new OrderProblem("VALIDATION_ERROR", "Administrator and waiver reason are required.");
        }
        if (overduePenaltyWaived) {
            if (!adminId.equals(overdueWaivedBy) || !explanation.equals(overdueWaiverReason)) {
                throw OrderProblem.conflict("This order already has a different overdue waiver.");
            }
            return;
        }
        if (status != OrderStatus.DELIVERED || !Boolean.TRUE.equals(deliveryOverdue)) {
            throw OrderProblem.conflict("Only overdue DELIVERED orders can receive a waiver before completion.");
        }
        overduePenaltyWaived = true;
        overdueWaivedAt = java.util.Objects.requireNonNull(now);
        overdueWaivedBy = adminId;
        overdueWaiverReason = explanation;
    }

    public void reconcileReportHolds(boolean hasActiveReports) {
        completionHold = hasActiveReports;
    }

    private void progress(String actor, long expectedVersion, OrderStatus from, OrderStatus to) {
        requireVersion(expectedVersion);
        requireStatus(from);
        if (courierId == null || !courierId.equals(actor)) {
            throw OrderProblem.forbidden("Only the assigned courier may act.");
        }
        status = to;
    }

    public void confirmCompletion(String actor, long expectedVersion) {
        validateCompletion(actor, expectedVersion);
        status = OrderStatus.COMPLETED;
    }

    public void completeAutomatically(long expectedVersion) {
        requireVersion(expectedVersion);
        requireStatus(OrderStatus.DELIVERED);
        requireCompletionAllowed();
        status = OrderStatus.COMPLETED;
    }

    public void validateCompletion(String actor, long expectedVersion) {
        if (!requesterId.equals(actor)) {
            throw OrderProblem.forbidden("Only the requester may confirm completion.");
        }
        // A report changes the stored version; still explain the hold to its owner with a stale browser.
        requireCompletionAllowed();
        requireVersion(expectedVersion);
        requireStatus(OrderStatus.DELIVERED);
    }

    public void placeCompletionHold(String actor) {
        validateCompletionHoldPlacement(actor);
        completionHold = true;
    }

    public void placeCourierReportHold(String actor) {
        if (courierId == null || !courierId.equals(actor)) {
            throw OrderProblem.forbidden("Only the assigned courier may report this errand.");
        }
        if (status != OrderStatus.ACCEPTED && status != OrderStatus.IN_PROGRESS
                && status != OrderStatus.PICKED_UP && status != OrderStatus.DELIVERED) {
            throw OrderProblem.conflict("Only an active assigned errand can be reported.");
        }
        completionHold = true;
    }

    public void validateCompletionHoldPlacement(String actor) {
        if (!requesterId.equals(actor)) {
            throw OrderProblem.forbidden("Only the requester may place a report hold on their order.");
        }
        if (status == OrderStatus.COMPLETED) {
            throw OrderProblem.conflict("A completion hold cannot be placed on a completed order.");
        }
    }

    private void requireCompletionAllowed() {
        if (completionHold) {
            throw new OrderProblem("COMPLETION_ON_HOLD",
                    "This order has an ongoing report. You can complete it after the report is resolved.");
        }
    }

    private void requireFundingOutcomeAllowed() {
        if (completionHold) {
            throw new OrderProblem("ORDER_ON_HOLD",
                    "This order has an active report. Please resolve it before proceeding.");
        }
    }

    public void cancelOpen(String actor, long expectedVersion) {
        validateOpenCancellation(actor, expectedVersion);
        status = OrderStatus.CANCELLED;
    }

    /** Admin report resolution may cancel active held orders without releasing report history. */
    public void cancelByAdmin(String expectedRequesterId, String expectedCourierId) {
        cancelByAdmin(expectedRequesterId, expectedCourierId, Instant.now(), null);
    }

    public void cancelByAdmin(String expectedRequesterId, String expectedCourierId,
                              Instant resolvedAt, PenaltySystemPolicy penalty) {
        cancelByAdmin(expectedRequesterId, expectedCourierId, resolvedAt, penalty, null);
    }

    public void cancelByAdmin(String expectedRequesterId, String expectedCourierId,
                              Instant resolvedAt, PenaltySystemPolicy penalty, String resolutionReason) {
        requireAdminParticipants(expectedRequesterId, expectedCourierId, "cancellation");
        if (status != OrderStatus.OPEN && status != OrderStatus.ACCEPTED
                && status != OrderStatus.IN_PROGRESS && status != OrderStatus.PICKED_UP
                && status != OrderStatus.DELIVERED) {
            throw OrderProblem.conflict("Only active orders can be cancelled by an administrator.");
        }
        if (penalty != null) penalty = higherPenalty(appliedPenalty, penalty);
        recordAdminDecision(resolvedAt, penalty, "cancellation", resolutionReason);
        status = OrderStatus.CANCELLED;
    }

    private void requireAdminParticipants(String expectedRequesterId, String expectedCourierId, String action) {
        if (!java.util.Objects.equals(requesterId, expectedRequesterId)
                || !java.util.Objects.equals(courierId, expectedCourierId)) {
            throw OrderProblem.conflict("Order participants do not match the " + action + " request.");
        }
    }

    private void recordAdminDecision(Instant resolvedAt, PenaltySystemPolicy penalty, String action, String resolutionReason) {
        java.util.Objects.requireNonNull(resolvedAt);
        if (penalty == PenaltySystemPolicy.getSuccessfulDeliveryReward()
                || (penalty != null && courierId == null)) {
            throw new OrderProblem("VALIDATION_ERROR", "Admin " + action + " requires a courier penalty addition case.");
        }
        String explanation = normalizeAdminResolutionReason(resolutionReason);
        adminResolutionReason = explanation;
        adminResolutionAt = resolvedAt;
        adminPenaltyDecision = penalty == null ? AdminPenaltyDecision.WAIVED : AdminPenaltyDecision.ADDITION_REQUESTED;
        adminPenaltyReason = penalty;
        adminPenaltyAmount = penalty == null ? 0 : penalty.getPenaltyAmount();
    }

    public static String normalizeAdminResolutionReason(String reason) {
        if (reason == null) return null;
        String normalized = reason.strip();
        if (normalized.isBlank() || reason.length() > 1000) {
            throw new OrderProblem("VALIDATION_ERROR", "Admin resolution reason must contain 1 through 1000 characters.");
        }
        return normalized;
    }

    public void validateOpenCancellation(String actor, long expectedVersion) {
        // Report placement changes the version; explain its hold only to its owner.
        if (requesterId.equals(actor)) requireFundingOutcomeAllowed();
        requireVersion(expectedVersion);
        requireStatus(OrderStatus.OPEN);
        if (!requesterId.equals(actor)) {
            throw OrderProblem.forbidden("Only the requester may cancel.");
        }
    }

    public void reopenAfterAcceptedCancellation(String actor, long expectedVersion, Instant now) {
        validateAcceptedCancellation(actor, expectedVersion);
        if (!now.isBefore(expiresAt)) {
            throw OrderProblem.conflict("Expired order cannot be reopened.");
        }
        status = OrderStatus.OPEN;
        courierId = null;
        clearAppliedPenalty();
    }

    public void abortAfterAcceptedCancellation(String actor, long expectedVersion, Instant now) {
        validateAcceptedCancellation(actor, expectedVersion);
        if (now.isBefore(expiresAt)) {
            throw OrderProblem.conflict("Unexpired order must be reopened after Credit confirms the hold.");
        }
        status = OrderStatus.EXPIRED;
        courierId = null;
    }

    public void validateAcceptedCancellation(String actor, long expectedVersion) {
        if (courierId != null && courierId.equals(actor)) requireFundingOutcomeAllowed();
        requireVersion(expectedVersion);
        requireStatus(OrderStatus.ACCEPTED);
        if (courierId == null || !courierId.equals(actor)) {
            throw OrderProblem.forbidden("Only the assigned courier may cancel an accepted order.");
        }
    }

    public void expire(long expectedVersion, Instant now) {
        requireVersion(expectedVersion);
        requireStatus(OrderStatus.OPEN);
        if (now.isBefore(expiresAt)) {
            throw OrderProblem.conflict("Order is not due for expiry.");
        }
        requireFundingOutcomeAllowed();
        status = OrderStatus.EXPIRED;
    }

    public void configureReposting(RepostPlan plan, String actor, long expectedVersion) {
        throw OrderProblem.conflict("Automatic repost settings must be chosen when the order is created.");
    }

    public boolean eligibleForAutomaticRepost(Instant now) {
        return status == OrderStatus.EXPIRED && !completionHold && repostedOrderId == null && repostPlan != null
                && repostPlan.isEnabled() && repostPlan.isDueAt(now) && !repostPlan.isUsed()
                && repostPlan.hasFutureExpiry(now);
    }

    public void linkRepost(String repostId) {
        if (repostedOrderId != null) {
            throw OrderProblem.conflict("Order already has a repost.");
        }
        repostedOrderId = repostId;
        repostFailureCode = null;
        repostFailureMessage = null;
        repostFailureAt = null;
        if (repostPlan != null) {
            repostPlan.markUsed();
        }
    }

    public Order createRepost(String description, long credits, int duration, Instant createdAt, Instant expiresAt) {
        return createRepostWithId(UUID.randomUUID().toString(), description, credits, duration, createdAt, expiresAt);
    }

    public Order createRepostWithId(String candidateId, String description, long credits, int duration,
            Instant createdAt, Instant expiresAt) {
        if (status != OrderStatus.EXPIRED || repostedOrderId != null) {
            throw OrderProblem.conflict("Order is not eligible for repost.");
        }
        if (description == null || description.isBlank() || description.length() > 100
                || credits <= 0 || duration < 15 || expiresAt == null || !expiresAt.isAfter(createdAt)) {
            throw new OrderProblem("VALIDATION_ERROR", "Invalid repost details or expired new expiry.");
        }
        if (candidateId == null || candidateId.isBlank() || candidateId.equals(id)) {
            throw new OrderProblem("VALIDATION_ERROR", "Repost requires a distinct new order ID.");
        }
        return new Order(candidateId, requesterId, description, pickupSupplierId,
                deliverySupplierId, credits, duration, createdAt, expiresAt, id);
    }

    public Order createManualRepost(String description, long credits, int duration, Instant createdAt, Instant expiresAt) {
        return createManualRepostWithId(UUID.randomUUID().toString(), description, credits, duration,
                createdAt, createdAt, expiresAt);
    }

    /** The initial submission window is immutable; recovery must not slide it forward. */
    public Order createManualRepostWithId(String candidateId, String description, long credits, int duration,
            Instant submittedAt, Instant createdAt, Instant expiresAt) {
        if (status != OrderStatus.EXPIRED || repostedOrderId != null) {
            throw OrderProblem.conflict("Order is not eligible for repost.");
        }
        List<OrderProblem.Detail> errors = new ArrayList<>();
        validateRepostFields(description, credits, duration, submittedAt.plus(MINIMUM_POSTING_WINDOW), expiresAt, errors);
        rejectInvalidFields(errors);
        return createRepostWithId(candidateId, description, credits, duration, createdAt, expiresAt);
    }

    private static void validateRepostFields(String description, long credits, int duration,
            Instant minimumExpiry, Instant expiresAt, List<OrderProblem.Detail> errors) {
        if (description == null || description.isBlank()) errors.add(new OrderProblem.Detail("itemDescription", "Describe what you need."));
        else if (description.length() > 100) errors.add(new OrderProblem.Detail("itemDescription", "Description must be 100 characters or fewer."));
        if (credits < 1) errors.add(new OrderProblem.Detail("offeredCredits", "Offered credits must be at least 1."));
        if (duration < 15) errors.add(new OrderProblem.Detail("deliveryTimeLimitMinutes", "Delivery time must be at least 15 minutes."));
        if (expiresAt == null) errors.add(new OrderProblem.Detail("expiresAt", "Choose an order expiry time."));
        else if (expiresAt.isBefore(minimumExpiry)) errors.add(new OrderProblem.Detail("expiresAt", "Order expiry must be at least 30 minutes from now. Choose a later time."));
    }

    private static void rejectInvalidFields(List<OrderProblem.Detail> errors) {
        if (!errors.isEmpty()) {
            throw new OrderProblem("VALIDATION_ERROR", String.join(" ", errors.stream().map(OrderProblem.Detail::getMessage).toList()), errors);
        }
    }

    public void recordRepostFailure(String code, String message, Instant occurredAt) {
        requireStatus(OrderStatus.EXPIRED);
        if (repostedOrderId != null) {
            throw OrderProblem.conflict("Order already has a repost.");
        }
        if (repostFailureAt == null || !occurredAt.isBefore(repostFailureAt)) {
            repostFailureCode = code;
            repostFailureMessage = message;
            repostFailureAt = occurredAt;
        }
    }

    public void requireVersion(long expected) {
        if (version != expected) {
            throw OrderProblem.conflict("Order version is stale.");
        }
    }

    public static Order historicalAttempt(OrderCourierAttempt attempt) {
        Order history = new Order(attempt.getOrderId(), attempt.getRequesterId(),
                attempt.getItemDescription(), attempt.getPickupSupplierId(), attempt.getDeliverySupplierId(),
                attempt.getOfferedCredits(), attempt.getDeliveryTimeLimitMinutes(), attempt.getCreatedAt(),
                attempt.getExpiresAt(), attempt.getOriginalOrderId());
        history.rowId = attempt.getId();
        history.attemptId = attempt.getId();
        history.courierId = attempt.getCourierId();
        history.appliedPenalty = attempt.getAppliedPenalty();
        history.appliedPenaltyAt = attempt.getAppliedPenaltyAt();
        history.appliedPenaltyBy = attempt.getAppliedPenaltyBy();
        history.appliedPenaltyReason = attempt.getAppliedPenaltyReason();
        history.status = OrderStatus.ABORTED;
        history.version = attempt.getOrderVersion();
        history.repostedOrderId = attempt.getRepostedOrderId();
        return history;
    }

    private void requireStatus(OrderStatus expected) {
        if (status != expected) {
            throw OrderProblem.conflict("Order must be " + expected + ".");
        }
    }
}
