package com.friendoncampus.order.domain;

import java.time.Duration;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.time.temporal.ChronoUnit;
import java.util.Objects;
import java.util.Optional;
import java.util.UUID;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.EntityListeners;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.Version;

/**
 * Order aggregate and lifecycle state machine. Each transition method checks its guards, applies
 * the change and returns an {@link OrderTransition} describing it; a rejected action throws
 * {@link OrderTransitionException} and leaves the order unchanged. Deadline checks use
 * {@code now >= pickupDeadline} as "expired" (see DESIGN.md).
 */
@Entity
@Table(name = "orders")
@EntityListeners(OrderTimestampListener.class)
public class Order {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(name="review_case_id") private UUID reviewCaseId;
    @Column(name="review_resolution_id") private UUID reviewResolutionId;
    @Column(name="review_disposition") private String reviewDisposition;
    @Column(name="review_resolved_at") private OffsetDateTime reviewResolvedAt;

    @Column(name = "requester_id", nullable = false)
    private UUID requesterId;

    @Column(nullable = false, length = 120)
    private String title;

    @Column(nullable = false, length = 2000)
    private String description;

    @Column(name = "pickup_location_id", nullable = false)
    private UUID pickupLocationId;

    @Column(name = "dropoff_location_id", nullable = false)
    private UUID dropoffLocationId;

    @Column(name = "pickup_location_name_snapshot", length = 160)
    private String pickupLocationName;

    @Column(name = "dropoff_location_name_snapshot", length = 160)
    private String dropoffLocationName;

    @Column(name = "credit_reward", nullable = false)
    private int creditReward;

    /** Reward requested by an edit and awaiting Credit's answer; null when no adjustment is pending. */
    @Column(name = "pending_credit_reward")
    private Integer pendingCreditReward;

    @Column(name = "pickup_deadline", nullable = false)
    private OffsetDateTime pickupDeadline;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 32)
    private OrderState state;

    @Version
    @Column(nullable = false)
    private long version;

    @Column(name = "created_at", nullable = false)
    private OffsetDateTime createdAt;

    @Column(name = "updated_at", nullable = false)
    private OffsetDateTime updatedAt;

    @Column(name = "state_changed_at", nullable = false)
    private OffsetDateTime stateChangedAt;

    @Column(name = "correlation_id", nullable = false, updatable = false)
    private UUID correlationId;

    @Enumerated(EnumType.STRING)
    @Column(name = "credit_status", length = 16)
    private CreditStatus creditStatus;

    @Column(name = "courier_id")
    private UUID courierId;

    @Column(name = "credit_reservation_id")
    private UUID creditReservationId;

    @Enumerated(EnumType.STRING)
    @Column(name = "terminal_reason", length = 64)
    private TerminalReason terminalReason;

    @Column(name = "accepted_at")
    private OffsetDateTime acceptedAt;

    @Column(name = "picked_up_at")
    private OffsetDateTime pickedUpAt;

    @Column(name = "delivered_at")
    private OffsetDateTime deliveredAt;

    @Column(name = "completed_at")
    private OffsetDateTime completedAt;

    @Column(name = "cancelled_at")
    private OffsetDateTime cancelledAt;

    @Column(name = "expired_at")
    private OffsetDateTime expiredAt;

    @Column(name = "idempotency_key", length = 64, updatable = false)
    private String idempotencyKey;

    @Column(name = "idempotency_fingerprint", length = 64, updatable = false)
    private String idempotencyFingerprint;

    protected Order() {
    }

    /**
     * Creates a new order awaiting a credit reservation. The order always starts
     * in {@link OrderState#PENDING_CREDIT}; Credit Service later drives it to OPEN
     * or RESERVATION_FAILED via the event flow.
     */
    public static Order submit(
            UUID requesterId,
            String title,
            String description,
            UUID pickupLocationId,
            String pickupLocationName,
            UUID dropoffLocationId,
            String dropoffLocationName,
            int creditReward,
            OffsetDateTime pickupDeadline) {
        Order order = new Order();
        order.requesterId = requesterId;
        order.title = title;
        order.description = description;
        order.pickupLocationId = pickupLocationId;
        order.dropoffLocationId = dropoffLocationId;
        order.pickupLocationName = pickupLocationName;
        order.dropoffLocationName = dropoffLocationName;
        order.creditReward = creditReward;
        order.pickupDeadline = toStoredPrecision(pickupDeadline);
        order.state = OrderState.PENDING_CREDIT;
        order.correlationId = UUID.randomUUID();
        return order;
    }

    /**
     * Records the client's {@code Idempotency-Key} for this create request and the fingerprint of
     * the request it came with. Only for a new order, before it is first stored.
     */
    public void claimIdempotencyKey(String key, String fingerprint) {
        if (id != null) {
            throw new IllegalStateException("An idempotency key can only be set on a new order");
        }
        idempotencyKey = key;
        idempotencyFingerprint = fingerprint;
    }

    /** The SUBMIT transition recorded when a new order is first stored. */
    public OrderTransition submitted(OffsetDateTime now) {
        return new OrderTransition(OrderAction.SUBMIT, null, OrderState.PENDING_CREDIT, requesterId,
                ActorRole.REQUESTER, null, null, CreditEffect.RESERVE, "OrderSubmitted", now);
    }

    /**
     * Credit confirmed the reservation. If it arrives at or after the pickup deadline, the order
     * expires instead of opening, and the reservation must be released.
     */
    public OrderTransition open(UUID reservationId, OffsetDateTime now) {
        requireState(OrderAction.OPEN, OrderState.PENDING_CREDIT);
        creditReservationId = reservationId;
        creditStatus = CreditStatus.RESERVED;
        if (isPastDeadline(now)) {
            expiredAt = now;
            return moveTo(OrderAction.OPEN, OrderState.EXPIRED, null, ActorRole.SYSTEM, null,
                    TerminalReason.PICKUP_DEADLINE_PASSED, CreditEffect.RELEASE, "OrderExpired", now);
        }
        return moveTo(OrderAction.OPEN, OrderState.OPEN, null, ActorRole.SYSTEM, null, null,
                CreditEffect.NONE, "OrderOpened", now);
    }

    /** Credit rejected the reservation, for example because of insufficient credits. */
    public OrderTransition failReservation(TerminalReason reason, OffsetDateTime now) {
        requireState(OrderAction.FAIL_RESERVATION, OrderState.PENDING_CREDIT);
        return moveTo(OrderAction.FAIL_RESERVATION, OrderState.RESERVATION_FAILED, null,
                ActorRole.SYSTEM, null, reason,
                CreditEffect.NONE, "OrderReservationFailed", now);
    }

    /**
     * The requester cancels. OPEN orders release the full reservation. ACCEPTED orders clear the
     * courier: before the pickup deadline the courier is compensated; at or after it the courier is
     * late, so the reservation is released in full instead. Cancellation is never allowed after pickup.
     */
    public OrderTransition cancel(UUID callerId, OffsetDateTime now) {
        if (!requesterId.equals(callerId)) {
            throw new OrderTransitionException(OrderErrorCode.NOT_ORDER_REQUESTER, state,
                    "Only the order's requester can cancel it");
        }
        if (state == OrderState.PICKED_UP || state == OrderState.DELIVERED || state == OrderState.COMPLETED) {
            throw new OrderTransitionException(OrderErrorCode.CANCELLATION_NOT_ALLOWED, state,
                    "Orders cannot be cancelled once picked up");
        }
        if (state != OrderState.OPEN && state != OrderState.ACCEPTED) {
            throw invalidTransition(OrderAction.CANCEL);
        }
        cancelledAt = now;
        if (state == OrderState.OPEN) {
            // Credit releases the whole reservation, so a pending adjustment no longer matters.
            pendingCreditReward = null;
            return moveTo(OrderAction.CANCEL, OrderState.CANCELLED, callerId, ActorRole.REQUESTER, null,
                    TerminalReason.REQUESTER_CANCELLED_OPEN, CreditEffect.RELEASE, "OrderCancelled", now);
        }
        UUID formerCourier = courierId;
        courierId = null;
        if (isPastDeadline(now)) {
            // Like a ride app's free cancellation when the driver is late: the courier missed the
            // pickup deadline, so the requester gets everything back.
            return moveTo(OrderAction.CANCEL, OrderState.CANCELLED, callerId, ActorRole.REQUESTER, formerCourier,
                    TerminalReason.REQUESTER_CANCELLED_COURIER_LATE, CreditEffect.RELEASE, "OrderCancelled", now);
        }
        return moveTo(OrderAction.CANCEL, OrderState.CANCELLED, callerId, ActorRole.REQUESTER, formerCourier,
                TerminalReason.REQUESTER_CANCELLED_ACCEPTED, CreditEffect.COMPENSATE, "OrderCancelled", now);
    }

    /** The pickup deadline passed while the order was still OPEN; the reservation is released. */
    public OrderTransition expire(OffsetDateTime now) {
        requireState(OrderAction.EXPIRE, OrderState.OPEN);
        if (!isPastDeadline(now)) {
            throw new OrderTransitionException(OrderErrorCode.INVALID_STATE_TRANSITION, state,
                    "The pickup deadline has not passed yet");
        }
        expiredAt = now;
        pendingCreditReward = null;
        return moveTo(OrderAction.EXPIRE, OrderState.EXPIRED, null, ActorRole.SYSTEM, null,
                TerminalReason.PICKUP_DEADLINE_PASSED, CreditEffect.RELEASE, "OrderExpired", now);
    }

    /**
     * Credit has not answered the reservation by {@code creditTimeoutAt} (blueprint "pending-credit
     * timeout"): the order stops waiting and expires with {@link TerminalReason#CREDIT_RESERVATION_TIMEOUT}.
     * {@code OrderExpired} asks Credit to release whatever it may have reserved; Credit treats a
     * timeout with no reservation as a no-op.
     */
    public OrderTransition timeOutCreditReservation(OffsetDateTime creditTimeoutAt, OffsetDateTime now) {
        requireState(OrderAction.EXPIRE, OrderState.PENDING_CREDIT);
        if (now.isBefore(creditTimeoutAt)) {
            throw new OrderTransitionException(OrderErrorCode.INVALID_STATE_TRANSITION, state,
                    "The credit reservation has not timed out yet");
        }
        expiredAt = now;
        return moveTo(OrderAction.EXPIRE, OrderState.EXPIRED, null, ActorRole.SYSTEM, null,
                TerminalReason.CREDIT_RESERVATION_TIMEOUT, CreditEffect.RELEASE, "OrderExpired", now);
    }

    /**
     * When a PENDING_CREDIT order stops waiting for Credit: {@code createdAt + timeout}, or the
     * pickup deadline if that comes first.
     */
    public OffsetDateTime creditTimeoutAt(Duration timeout) {
        OffsetDateTime byTimeout = createdAt.plus(timeout);
        return byTimeout.isBefore(pickupDeadline) ? byTimeout : pickupDeadline;
    }

    /** True for an order that expired because Credit never answered its reservation. */
    public boolean timedOutWaitingForCredit() {
        return state == OrderState.EXPIRED && terminalReason == TerminalReason.CREDIT_RESERVATION_TIMEOUT;
    }

    /**
     * A courier accepts an OPEN order before its deadline. The requester can never accept their
     * own order, and an order someone else already accepted is reported as such.
     */
    public OrderTransition accept(UUID callerId, OffsetDateTime now) {
        if (requesterId.equals(callerId)) {
            throw new OrderTransitionException(OrderErrorCode.SELF_ACCEPTANCE_FORBIDDEN, state,
                    "You cannot accept your own order");
        }
        if (state == OrderState.ACCEPTED || state == OrderState.PICKED_UP || state == OrderState.DELIVERED
                || state == OrderState.COMPLETED) {
            throw new OrderTransitionException(OrderErrorCode.ORDER_ALREADY_ACCEPTED, state,
                    "This order has already been accepted by another courier");
        }
        if (state == OrderState.EXPIRED) {
            throw new OrderTransitionException(OrderErrorCode.ORDER_EXPIRED, state,
                    "This order expired before it could be accepted");
        }
        requireState(OrderAction.ACCEPT, OrderState.OPEN);
        if (isPastDeadline(now)) {
            throw new OrderTransitionException(OrderErrorCode.ORDER_EXPIRED, state,
                    "This order's pickup deadline has passed");
        }
        if (isRewardAdjustmentPending()) {
            throw new OrderTransitionException(OrderErrorCode.REWARD_ADJUSTMENT_PENDING, state,
                    "This order's reward is being changed; try again shortly");
        }
        courierId = callerId;
        acceptedAt = now;
        return moveTo(OrderAction.ACCEPT, OrderState.ACCEPTED, callerId, ActorRole.COURIER, callerId, null,
                CreditEffect.NONE, "OrderAccepted", now);
    }

    /**
     * The assigned courier withdraws before pickup. Before the deadline the order reopens for other
     * couriers; at or after the deadline it expires and the reservation is released.
     */
    public OrderTransition withdraw(UUID callerId, OffsetDateTime now) {
        if (courierId == null || !courierId.equals(callerId)) {
            throw new OrderTransitionException(OrderErrorCode.NOT_ASSIGNED_COURIER, state,
                    "Only the assigned courier can withdraw from this order");
        }
        if (state == OrderState.PICKED_UP || state == OrderState.DELIVERED || state == OrderState.COMPLETED) {
            throw new OrderTransitionException(OrderErrorCode.CANCELLATION_NOT_ALLOWED, state,
                    "Couriers cannot withdraw once the order is picked up");
        }
        requireState(OrderAction.WITHDRAW, OrderState.ACCEPTED);
        courierId = null;
        acceptedAt = null;
        if (isPastDeadline(now)) {
            expiredAt = now;
            return moveTo(OrderAction.WITHDRAW, OrderState.EXPIRED, callerId, ActorRole.COURIER, callerId,
                    TerminalReason.COURIER_WITHDREW_AFTER_DEADLINE, CreditEffect.RELEASE, "OrderExpired", now);
        }
        return moveTo(OrderAction.WITHDRAW, OrderState.OPEN, callerId, ActorRole.COURIER, callerId, null,
                CreditEffect.NONE, "OrderReopened", now);
    }

    /**
     * The assigned courier collects the item. The deadline does not apply once the order is
     * accepted, so a late pickup is allowed (DESIGN.md open item).
     */
    public OrderTransition pickUp(UUID callerId, OffsetDateTime now) {
        requireAssignedCourier(callerId);
        requireState(OrderAction.PICK_UP, OrderState.ACCEPTED);
        pickedUpAt = now;
        return moveTo(OrderAction.PICK_UP, OrderState.PICKED_UP, callerId, ActorRole.COURIER, callerId, null,
                CreditEffect.NONE, "OrderPickedUp", now);
    }

    /** The assigned courier hands the item over at the drop-off location. */
    public OrderTransition deliver(UUID callerId, OffsetDateTime now) {
        requireAssignedCourier(callerId);
        requireState(OrderAction.DELIVER, OrderState.PICKED_UP);
        deliveredAt = now;
        return moveTo(OrderAction.DELIVER, OrderState.DELIVERED, callerId, ActorRole.COURIER, callerId, null,
                CreditEffect.NONE, "OrderDelivered", now);
    }

    /** The requester confirms receipt; Credit transfers the full reservation to the courier. */
    public OrderTransition complete(UUID callerId, OffsetDateTime now) {
        if (!requesterId.equals(callerId)) {
            throw new OrderTransitionException(OrderErrorCode.NOT_ORDER_REQUESTER, state,
                    "Only the order's requester can confirm receipt");
        }
        requireState(OrderAction.COMPLETE, OrderState.DELIVERED);
        completedAt = now;
        return moveTo(OrderAction.COMPLETE, OrderState.COMPLETED, callerId, ActorRole.REQUESTER, courierId, null,
                CreditEffect.SETTLE, "OrderCompleted", now);
    }

    /**
     * The requester replaces the editable fields of an OPEN order (T4). If the reward differs, the
     * current reward is kept and the new one becomes pending until Credit answers (T5); the order
     * then cannot be accepted or edited again. Guards run in DESIGN.md rule 7 order: relationship,
     * state, duplicate, pending adjustment, version, then the deadline.
     *
     * <p>A body equal to what the order already holds (with a pending reward counting as the
     * reward) is a duplicate, for example a retried request: it returns empty and changes nothing,
     * whatever {@code expectedVersion} it carries.
     */
    public Optional<OrderTransition> edit(UUID callerId, long expectedVersion, OrderDetails details, OffsetDateTime now) {
        if (!requesterId.equals(callerId)) {
            throw new OrderTransitionException(OrderErrorCode.NOT_ORDER_REQUESTER, state,
                    "Only the order's requester can edit it");
        }
        requireState(OrderAction.EDIT, OrderState.OPEN);
        OffsetDateTime deadline = toStoredPrecision(details.pickupDeadline());
        if (alreadyHolds(details, deadline)) {
            return Optional.empty();
        }
        if (isRewardAdjustmentPending()) {
            throw new OrderTransitionException(OrderErrorCode.REWARD_ADJUSTMENT_PENDING, state,
                    "A reward change is waiting for Credit; edit again once it is answered");
        }
        if (expectedVersion != version) {
            throw new OrderVersionConflictException(state, expectedVersion, version);
        }
        if (!deadline.isAfter(now)) {
            throw new OrderTransitionException(OrderErrorCode.INVALID_PICKUP_DEADLINE, state,
                    "The pickup deadline must be in the future");
        }
        title = details.title();
        description = details.description();
        pickupLocationId = details.pickupLocationId();
        pickupLocationName = details.pickupLocationName();
        dropoffLocationId = details.dropoffLocationId();
        dropoffLocationName = details.dropoffLocationName();
        pickupDeadline = deadline;
        if (details.creditReward() != creditReward) {
            pendingCreditReward = details.creditReward();
            return Optional.of(new OrderTransition(OrderAction.EDIT, state, state, callerId, ActorRole.REQUESTER,
                    null, null, CreditEffect.ADJUST, "OrderRewardChangeRequested", now));
        }
        return Optional.of(new OrderTransition(OrderAction.EDIT, state, state, callerId, ActorRole.REQUESTER,
                null, null, CreditEffect.NONE, "OrderDetailsEdited", now));
    }

    private boolean alreadyHolds(OrderDetails details, OffsetDateTime deadline) {
        int effectiveReward = pendingCreditReward != null ? pendingCreditReward : creditReward;
        return title.equals(details.title())
                && description.equals(details.description())
                && pickupLocationId.equals(details.pickupLocationId())
                && Objects.equals(pickupLocationName, details.pickupLocationName())
                && dropoffLocationId.equals(details.dropoffLocationId())
                && Objects.equals(dropoffLocationName, details.dropoffLocationName())
                && effectiveReward == details.creditReward()
                && pickupDeadline.isEqual(deadline);
    }

    /**
     * True when Credit's answer to a reward change for {@code requestedReward} can still be applied:
     * the order is OPEN and that reward is the one pending (T5a/T5b guard).
     */
    public boolean awaitsRewardChange(int requestedReward) {
        return state == OrderState.OPEN && pendingCreditReward != null && pendingCreditReward == requestedReward;
    }

    /** Credit adjusted the reservation: the pending reward becomes the reward (T5a). */
    public OrderTransition applyRewardChange(int requestedReward, OffsetDateTime now) {
        requireAwaitedRewardChange(OrderAction.REWARD_CHANGE_APPLIED, requestedReward);
        creditReward = pendingCreditReward;
        pendingCreditReward = null;
        return new OrderTransition(OrderAction.REWARD_CHANGE_APPLIED, state, state, null, ActorRole.SYSTEM, null,
                null, CreditEffect.NONE, "OrderRewardChanged", now);
    }

    /** Credit rejected the adjustment: the previous reward stands and the pending one is dropped (T5b). */
    public OrderTransition rejectRewardChange(int requestedReward, OffsetDateTime now) {
        requireAwaitedRewardChange(OrderAction.REWARD_CHANGE_REJECTED, requestedReward);
        pendingCreditReward = null;
        return new OrderTransition(OrderAction.REWARD_CHANGE_REJECTED, state, state, null, ActorRole.SYSTEM, null,
                null, CreditEffect.NONE, "OrderRewardChangeRejected", now);
    }

    /** The OPEN sub-flag: a reward change was requested and Credit has not answered yet. */
    public boolean isRewardAdjustmentPending() {
        return pendingCreditReward != null;
    }

    private void requireAwaitedRewardChange(OrderAction action, int requestedReward) {
        if (!awaitsRewardChange(requestedReward)) {
            throw new OrderTransitionException(OrderErrorCode.INVALID_STATE_TRANSITION, state,
                    "Cannot " + action.name().toLowerCase().replace('_', ' ') + ": no matching reward change is pending");
        }
    }

    /** True for an OPEN order whose pickup deadline has been reached. */
    public boolean isOverdue(OffsetDateTime now) {
        return state == OrderState.OPEN && isPastDeadline(now);
    }

    /**
     * Records the outcome Credit reported for the order's latest credit operation. This never
     * changes the order's lifecycle state.
     */
    public void recordCreditStatus(CreditStatus status) {
        creditStatus = status;
    }

    /**
     * PostgreSQL stores microseconds and rounds anything finer, which could move a nanosecond
     * deadline later once saved. Truncating up front keeps the deadline checked in memory equal
     * to the stored one.
     */
    public static OffsetDateTime toStoredPrecision(OffsetDateTime timestamp) {
        return timestamp == null ? null : timestamp.truncatedTo(ChronoUnit.MICROS);
    }

    /** True when the pickup deadline has been reached: {@code now >= pickupDeadline}. */
    public boolean isPastDeadline(OffsetDateTime now) {
        return !now.isBefore(pickupDeadline);
    }

    /** True for OPEN orders and for orders where the caller is the requester or assigned courier. */
    public boolean isVisibleTo(UUID callerId) {
        return (state == OrderState.OPEN && reviewCaseId==null) || isParticipant(callerId);
    }

    public boolean isParticipant(UUID callerId) {
        return requesterId.equals(callerId) || (courierId != null && courierId.equals(callerId));
    }

    private void requireAssignedCourier(UUID callerId) {
        if (courierId == null || !courierId.equals(callerId)) {
            throw new OrderTransitionException(OrderErrorCode.NOT_ASSIGNED_COURIER, state,
                    "Only the assigned courier can do this");
        }
    }

    private void requireState(OrderAction action, OrderState expected) {
        if (state != expected) {
            throw invalidTransition(action);
        }
    }

    private OrderTransitionException invalidTransition(OrderAction action) {
        return new OrderTransitionException(OrderErrorCode.INVALID_STATE_TRANSITION, state,
                "Cannot " + action.name().toLowerCase().replace('_', ' ') + " an order in state " + state);
    }

    private OrderTransition moveTo(OrderAction action, OrderState target, UUID actorId, ActorRole actorRole,
            UUID transitionCourierId, TerminalReason reason, CreditEffect creditEffect, String eventType,
            OffsetDateTime now) {
        OrderState from = state;
        state = target;
        stateChangedAt = now;
        if (reason != null) {
            terminalReason = reason;
        }
        return new OrderTransition(action, from, target, actorId, actorRole, transitionCourierId, reason,
                creditEffect, eventType, now);
    }

    /**
     * Stamps the creation time. {@link OrderTimestampListener} calls this with the service clock just
     * before the first insert, so the credit timeout ({@code createdAt + timeout}) is measured on the
     * same clock as every other deadline. A stored order keeps the creation time it has.
     */
    public void stampCreatedAt(OffsetDateTime now) {
        if (createdAt != null) {
            throw new IllegalStateException("createdAt is already set");
        }
        createdAt = now;
        updatedAt = now;
        if (stateChangedAt == null) {
            stateChangedAt = now;
        }
    }

    /** Stamps a change to a stored order; never earlier than its creation. */
    void stampUpdatedAt(OffsetDateTime now) {
        updatedAt = createdAt != null && now.isBefore(createdAt) ? createdAt : now;
    }

    boolean isCreatedAtStamped() {
        return createdAt != null;
    }

    public UUID getReviewCaseId(){return reviewCaseId;}
    public boolean isUnderReview(){return reviewCaseId!=null && reviewResolvedAt==null;}
    public boolean isResolvedAfterReview(){return reviewResolvedAt!=null;}
    public UUID getReviewResolutionId(){return reviewResolutionId;}
    public String getReviewDisposition(){return reviewDisposition;}
    public void requireNoReview(){if(reviewCaseId!=null)throw new org.springframework.web.server.ResponseStatusException(org.springframework.http.HttpStatus.CONFLICT,"This errand is under review or finished after review. Normal errand actions are unavailable.");}
    public void freezeForReview(UUID caseId){
        if(reviewCaseId!=null){if(!reviewCaseId.equals(caseId))throw new IllegalArgumentException("Another case owns this errand");return;}
        if(state==OrderState.PENDING_CREDIT || pendingCreditReward!=null || (state==OrderState.COMPLETED&&creditStatus!=CreditStatus.SETTLED) || (state==OrderState.CANCELLED&&creditStatus!=CreditStatus.RELEASED&&creditStatus!=CreditStatus.COMPENSATED) || (state==OrderState.EXPIRED&&creditStatus!=CreditStatus.RELEASED))
            throw new org.springframework.web.server.ResponseStatusException(org.springframework.http.HttpStatus.CONFLICT,"An earlier credit operation still needs confirmation. Retry reporting after it completes.");
        reviewCaseId=caseId;
    }
    public void prepareReviewResolution(UUID caseId,UUID operation,String disposition){
        if(!caseId.equals(reviewCaseId))throw new IllegalArgumentException("Case does not own this review");
        if(reviewResolutionId!=null && (!operation.equals(reviewResolutionId)||!disposition.equals(reviewDisposition)))throw new IllegalArgumentException("Resume the original dispute resolution");
        reviewResolutionId=operation;reviewDisposition=disposition;
    }
    public OrderTransition finishReview(OffsetDateTime now){
        if(reviewResolvedAt!=null)return null;
        if(reviewCaseId==null||reviewResolutionId==null)throw new IllegalStateException("Prepare the dispute resolution first");
        OrderState from=state;
        if(!java.util.Set.of(OrderState.COMPLETED,OrderState.CANCELLED,OrderState.EXPIRED,OrderState.RESERVATION_FAILED).contains(state)){state=OrderState.COMPLETED;completedAt=now;terminalReason=TerminalReason.DISPUTE_RESOLVED;}
        reviewResolvedAt=now;stateChangedAt=now;
        return new OrderTransition(OrderAction.DISPUTE_RESOLVED,from,state,null,ActorRole.SYSTEM,courierId,null,CreditEffect.NONE,"OrderDisputeResolved",now);
    }
    public UUID getId() {
        return id;
    }

    public UUID getRequesterId() {
        return requesterId;
    }

    public String getTitle() {
        return title;
    }

    public String getDescription() {
        return description;
    }

    public UUID getPickupLocationId() {
        return pickupLocationId;
    }

    public UUID getDropoffLocationId() {
        return dropoffLocationId;
    }

    /** Location name the client sent at creation; Supplier edits never rewrite it. */
    public String getPickupLocationName() {
        return pickupLocationName;
    }

    public String getDropoffLocationName() {
        return dropoffLocationName;
    }

    public int getCreditReward() {
        return creditReward;
    }

    /** Reward awaiting Credit's confirmation; null when none. {@link #getCreditReward()} is still in force. */
    public Integer getPendingCreditReward() {
        return pendingCreditReward;
    }

    public OffsetDateTime getPickupDeadline() {
        return pickupDeadline;
    }

    public OrderState getState() {
        return state;
    }

    public long getVersion() {
        return version;
    }

    public OffsetDateTime getCreatedAt() {
        return createdAt;
    }

    public OffsetDateTime getUpdatedAt() {
        return updatedAt;
    }

    public OffsetDateTime getStateChangedAt() {
        return stateChangedAt;
    }

    public UUID getCorrelationId() {
        return correlationId;
    }

    public CreditStatus getCreditStatus() {
        return creditStatus;
    }

    public UUID getCourierId() {
        return courierId;
    }

    public UUID getCreditReservationId() {
        return creditReservationId;
    }

    public TerminalReason getTerminalReason() {
        return terminalReason;
    }

    public OffsetDateTime getAcceptedAt() {
        return acceptedAt;
    }

    public OffsetDateTime getPickedUpAt() {
        return pickedUpAt;
    }

    public OffsetDateTime getDeliveredAt() {
        return deliveredAt;
    }

    public OffsetDateTime getCompletedAt() {
        return completedAt;
    }

    public OffsetDateTime getCancelledAt() {
        return cancelledAt;
    }

    public OffsetDateTime getExpiredAt() {
        return expiredAt;
    }

    /** The {@code Idempotency-Key} the order was created with; null when none was sent. */
    public String getIdempotencyKey() {
        return idempotencyKey;
    }

    public String getIdempotencyFingerprint() {
        return idempotencyFingerprint;
    }

}
