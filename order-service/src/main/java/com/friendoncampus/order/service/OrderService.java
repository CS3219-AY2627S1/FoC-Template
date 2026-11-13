package com.friendoncampus.order.service;

import java.time.Clock;
import java.time.Duration;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.friendoncampus.order.domain.OrderAction;
import com.friendoncampus.order.domain.Order;
import com.friendoncampus.order.domain.OrderDetails;
import com.friendoncampus.order.domain.OrderErrorCode;
import com.friendoncampus.order.domain.OrderState;
import com.friendoncampus.order.domain.TerminalReason;
import com.friendoncampus.order.domain.OrderTransition;
import com.friendoncampus.order.domain.OrderTransitionRecord;
import com.friendoncampus.order.messaging.OrderEventRecorder;
import com.friendoncampus.order.repository.OrderRepository;
import com.friendoncampus.order.repository.OrderTransitionRepository;

/**
 * Order use cases. Every state change runs in one transaction that locks the order row, applies
 * the domain transition, and records its history row and outbox event, so either all of them are
 * stored or none are.
 */
@Service
public class OrderService {

    /** Credit's draft default (blueprint "pending-credit timeout"), approved by the Order owner. */
    public static final Duration DEFAULT_CREDIT_RESERVATION_TIMEOUT = Duration.ofMinutes(2);

    private final OrderRepository orderRepository;
    private final OrderTransitionRepository transitionRepository;
    private final OrderEventRecorder eventRecorder;
    private final Clock clock;
    private final Duration creditReservationTimeout;

    public OrderService(
            OrderRepository orderRepository,
            OrderTransitionRepository transitionRepository,
            OrderEventRecorder eventRecorder,
            Clock clock) {
        this(orderRepository, transitionRepository, eventRecorder, clock, DEFAULT_CREDIT_RESERVATION_TIMEOUT);
    }

    @Autowired
    public OrderService(
            OrderRepository orderRepository,
            OrderTransitionRepository transitionRepository,
            OrderEventRecorder eventRecorder,
            Clock clock,
            @Value("${app.orders.credit-reservation-timeout:PT2M}") Duration creditReservationTimeout) {
        if (creditReservationTimeout.isNegative() || creditReservationTimeout.isZero()) {
            throw new IllegalArgumentException("app.orders.credit-reservation-timeout must be positive");
        }
        this.orderRepository = orderRepository;
        this.transitionRepository = transitionRepository;
        this.eventRecorder = eventRecorder;
        this.clock = clock;
        this.creditReservationTimeout = creditReservationTimeout;
    }

    /** Persists a new order in PENDING_CREDIT and records {@code OrderSubmitted} (Credit reserves). */
    @Transactional
    public Order createOrder(CreateOrderCommand command) {
        return createOrder(command, null).order();
    }

    /**
     * As {@link #createOrder(CreateOrderCommand)}, made safe to retry by the client's
     * {@code idempotencyKey} (null when none was sent). The first request with a key creates the
     * order; a repeat by the same requester with the same request returns that order and writes
     * nothing, so there is no second {@code OrderSubmitted} and no second reservation. The same key
     * with a different request is rejected with {@code IDEMPOTENCY_KEY_REUSED}. Concurrent requests
     * with one key are serialised by a transaction-scoped lock, so exactly one creates the order.
     */
    @Transactional
    public CreateOrderResult createOrder(CreateOrderCommand command, String idempotencyKey) {
        if (idempotencyKey == null) {
            return new CreateOrderResult(submit(command, null, null), false);
        }
        String fingerprint = CreateOrderFingerprint.of(command);
        orderRepository.lockIdempotencyKey(command.requesterId() + ":" + idempotencyKey);
        return orderRepository.findByRequesterIdAndIdempotencyKey(command.requesterId(), idempotencyKey)
                .map(existing -> {
                    if (!existing.getIdempotencyFingerprint().equals(fingerprint)) {
                        throw new IdempotencyKeyException(OrderErrorCode.IDEMPOTENCY_KEY_REUSED,
                                "This Idempotency-Key was already used for a different errand");
                    }
                    return new CreateOrderResult(existing, true);
                })
                .orElseGet(() -> new CreateOrderResult(submit(command, idempotencyKey, fingerprint), false));
    }

    private Order submit(CreateOrderCommand command, String idempotencyKey, String fingerprint) {
        Order order = Order.submit(
                command.requesterId(),
                command.title(),
                command.description(),
                command.pickupLocationId(),
                command.pickupLocationName(),
                command.dropoffLocationId(),
                command.dropoffLocationName(),
                command.creditReward(),
                command.pickupDeadline());
        if (idempotencyKey != null) {
            order.claimIdempotencyKey(idempotencyKey, fingerprint);
        }
        Order saved = orderRepository.saveAndFlush(order);
        eventRecorder.record(saved, saved.submitted(now()));
        return saved;
    }

    /** Returns the order if the caller may see it; otherwise reports it as not found. */
    @Transactional(readOnly = true)
    public Order getOrder(UUID orderId, UUID callerId) {
        Order order = orderRepository.findById(orderId)
                .orElseThrow(() -> new OrderNotFoundException(orderId));
        if (!order.isVisibleTo(callerId) && !reviewParticipant(order,callerId)) {
            throw new OrderNotFoundException(orderId);
        }
        return order;
    }

    /** The order's transitions in the order they happened; participants only. */
    @Transactional(readOnly = true)
    public List<OrderTransitionRecord> getHistory(UUID orderId, UUID callerId) {
        Order order = orderRepository.findById(orderId)
                .orElseThrow(() -> new OrderNotFoundException(orderId));
        if (!order.isParticipant(callerId) && !reviewParticipant(order,callerId)) {
            throw new OrderNotFoundException(orderId);
        }
        return transitionRepository.findByOrderIdOrderByOccurredAtAscOrderVersionAsc(orderId);
    }

    /**
     * The requester cancels. Repeating a cancel the same requester already made returns the
     * cancelled order without recording anything again. An overdue OPEN order is expired instead.
     */
    @Transactional(noRollbackFor = OrderExpiredOnActionException.class)
    public Order cancel(UUID orderId, UUID callerId) {
        Order order = lockVisible(orderId, callerId);
        order.requireNoReview();
        expireIfOverdue(order);
        if (order.getState() == OrderState.CANCELLED && order.getRequesterId().equals(callerId)) {
            return order;
        }
        return apply(order, order.cancel(callerId, now()));
    }

    /**
     * A courier accepts an OPEN order. The row lock means the first request processed wins; later
     * ones see the accepted order and get {@code ORDER_ALREADY_ACCEPTED}. An overdue order is
     * expired instead. Repeating an acceptance the same courier already made is a no-op.
     */
    @Transactional(noRollbackFor = OrderExpiredOnActionException.class)
    public Order accept(UUID orderId, UUID callerId) {
        // Not hidden behind visibility: a courier racing for an order saw it in the pool, so the
        // loser is told it was taken (409) rather than that it does not exist (404).
        Order order = orderRepository.findByIdForUpdate(orderId)
                .orElseThrow(() -> new OrderNotFoundException(orderId));
        if (neverListed(order) && !order.isParticipant(callerId)) {
            throw new OrderNotFoundException(orderId);
        }
        expireIfOverdue(order);
        if (order.getState() == OrderState.ACCEPTED && callerId.equals(order.getCourierId())) {
            return order;
        }
        return apply(order, order.accept(callerId, now()));
    }

    /**
     * The assigned courier withdraws. Before the deadline the order reopens; at or after it, the
     * order expires. Repeating a withdrawal the same courier just made is a no-op.
     */
    @Transactional
    public Order withdraw(UUID orderId, UUID callerId) {
        Order order = orderRepository.findByIdForUpdate(orderId)
                .orElseThrow(() -> new OrderNotFoundException(orderId));
        order.requireNoReview();
        if (lastTransitionWasWithdrawalBy(orderId, callerId)) {
            return order;
        }
        if (!order.isVisibleTo(callerId)) {
            throw new OrderNotFoundException(orderId);
        }
        return apply(order, order.withdraw(callerId, now()));
    }

    /** The assigned courier picks the item up. Repeating it is a no-op. */
    @Transactional
    public Order pickUp(UUID orderId, UUID callerId) {
        Order order = lockVisible(orderId, callerId);
        if (alreadyIn(order, OrderState.PICKED_UP, callerId, OrderAction.PICK_UP)) {
            return order;
        }
        return apply(order, order.pickUp(callerId, now()));
    }

    /** The assigned courier delivers the item. Repeating it is a no-op. */
    @Transactional
    public Order deliver(UUID orderId, UUID callerId) {
        Order order = lockVisible(orderId, callerId);
        if (alreadyIn(order, OrderState.DELIVERED, callerId, OrderAction.DELIVER)) {
            return order;
        }
        return apply(order, order.deliver(callerId, now()));
    }

    /**
     * The requester confirms receipt and Credit settles the reward to the courier. A repeated
     * confirmation (for example after a network retry) returns the completed order and records
     * no second settlement (F7.1.1).
     */
    @Transactional
    public Order complete(UUID orderId, UUID callerId) {
        Order order = lockVisible(orderId, callerId);
        if (alreadyIn(order, OrderState.COMPLETED, callerId, OrderAction.COMPLETE)) {
            return order;
        }
        return apply(order, order.complete(callerId, now()));
    }

    /**
     * The requester edits an OPEN order (T4), or requests a new reward (T5), based on the
     * {@code expectedVersion} they last saw. Only a reward change writes an outbox event
     * ({@code OrderRewardChangeRequested}); the current reward stays in force until Credit answers.
     * Resending what the order already holds returns it unchanged. An overdue order is expired
     * instead.
     */
    @Transactional(noRollbackFor = OrderExpiredOnActionException.class)
    public Order edit(UUID orderId, UUID callerId, long expectedVersion, OrderDetails details) {
        Order order = lockVisible(orderId, callerId);
        expireIfOverdue(order);
        return order.edit(callerId, expectedVersion, details, now())
                .map(transition -> apply(order, transition))
                .orElse(order);
    }

    /**
     * Credit adjusted the reservation to {@code newCreditReward} (T5a). Ignored when the order is no
     * longer OPEN or that reward is no longer pending (cancelled, expired, or already answered).
     *
     * @return true if the reward was applied
     */
    @Transactional
    public boolean applyRewardChange(UUID orderId, int newCreditReward) {
        return applyRewardChange(orderId, newCreditReward, null);
    }

    /** As {@link #applyRewardChange(UUID, int)}, caused by the Credit event {@code causationId}. */
    @Transactional
    public boolean applyRewardChange(UUID orderId, int newCreditReward, UUID causationId) {
        Order order = orderRepository.findByIdForUpdate(orderId)
                .orElseThrow(() -> new OrderNotFoundException(orderId));
        if (!order.awaitsRewardChange(newCreditReward)) {
            return false;
        }
        apply(order, order.applyRewardChange(newCreditReward, now()), causationId);
        return true;
    }

    /**
     * Credit rejected the adjustment to {@code newCreditReward} (T5b): the previous reward stands.
     * Ignored like {@link #applyRewardChange}.
     *
     * @return true if the pending reward was cleared
     */
    @Transactional
    public boolean rejectRewardChange(UUID orderId, int newCreditReward) {
        return rejectRewardChange(orderId, newCreditReward, null);
    }

    /** As {@link #rejectRewardChange(UUID, int)}, caused by the Credit event {@code causationId}. */
    @Transactional
    public boolean rejectRewardChange(UUID orderId, int newCreditReward, UUID causationId) {
        Order order = orderRepository.findByIdForUpdate(orderId)
                .orElseThrow(() -> new OrderNotFoundException(orderId));
        if (!order.awaitsRewardChange(newCreditReward)) {
            return false;
        }
        apply(order, order.rejectRewardChange(newCreditReward, now()), causationId);
        return true;
    }

    /** IDs of OPEN orders whose pickup deadline has been reached, for the expiry job. */
    @Transactional(readOnly = true)
    public List<UUID> findOverdueOpenOrderIds(int limit) {
        return orderRepository.findIdsDueBy(OrderState.OPEN, now(), PageRequest.of(0, limit));
    }

    /**
     * Expires the order if it is still OPEN and overdue once locked; returns false when another
     * transition (for example an acceptance) got there first.
     */
    @Transactional
    public boolean expireIfStillOverdue(UUID orderId) {
        Order order = orderRepository.findByIdForUpdate(orderId).orElse(null);
        if (order == null || order.isUnderReview() || !order.isOverdue(now())) {
            return false;
        }
        apply(order, order.expire(now()));
        return true;
    }

    /** IDs of PENDING_CREDIT orders whose credit timeout has been reached, for the expiry job. */
    @Transactional(readOnly = true)
    public List<UUID> findTimedOutPendingCreditOrderIds(int limit) {
        OffsetDateTime now = now();
        return orderRepository.findPendingCreditIdsTimedOut(now.minus(creditReservationTimeout), now,
                PageRequest.of(0, limit));
    }

    /**
     * Expires the order with {@code CREDIT_RESERVATION_TIMEOUT} if, once locked, it is still waiting
     * for Credit and its timeout has been reached; returns false when a Credit answer got there first
     * or it was already handled. The state, history row and {@code OrderExpired} outbox row commit
     * together, so repeated runs write nothing more.
     */
    @Transactional
    public boolean timeOutPendingCreditIfDue(UUID orderId) {
        Order order = orderRepository.findByIdForUpdate(orderId).orElse(null);
        if (order == null || order.getState() != OrderState.PENDING_CREDIT) {
            return false;
        }
        OffsetDateTime timeoutAt = order.creditTimeoutAt(creditReservationTimeout);
        OffsetDateTime now = now();
        if (now.isBefore(timeoutAt)) {
            return false;
        }
        apply(order, order.timeOutCreditReservation(timeoutAt, now));
        return true;
    }

    /**
     * Credit confirmed the reservation (called by the Credit reply consumer in a later iteration).
     * A repeated confirmation for an order that already left PENDING_CREDIT is ignored.
     */
    @Transactional
    public Order confirmReservation(UUID orderId, UUID reservationId) {
        return confirmReservation(orderId, reservationId, null);
    }

    /** As {@link #confirmReservation(UUID, UUID)}, caused by the Credit event {@code causationId}. */
    @Transactional
    public Order confirmReservation(UUID orderId, UUID reservationId, UUID causationId) {
        Order order = orderRepository.findByIdForUpdate(orderId)
                .orElseThrow(() -> new OrderNotFoundException(orderId));
        if (order.getState() != OrderState.PENDING_CREDIT && alreadyHandled(orderId, OrderAction.OPEN)) {
            return order;
        }
        return apply(order, order.open(reservationId, now()), causationId);
    }

    /** Credit rejected the reservation for {@code reason}. A repeated rejection is ignored. */
    @Transactional
    public Order rejectReservation(UUID orderId, TerminalReason reason) {
        return rejectReservation(orderId, reason, null);
    }

    /** As {@link #rejectReservation(UUID, TerminalReason)}, caused by the Credit event {@code causationId}. */
    @Transactional
    public Order rejectReservation(UUID orderId, TerminalReason reason, UUID causationId) {
        Order order = orderRepository.findByIdForUpdate(orderId)
                .orElseThrow(() -> new OrderNotFoundException(orderId));
        if (order.getState() == OrderState.RESERVATION_FAILED) {
            return order;
        }
        return apply(order, order.failReservation(reason, now()), causationId);
    }

    private boolean reviewParticipant(Order order,UUID caller){
        return order.getReviewCaseId()!=null && transitionRepository.findByOrderIdOrderByOccurredAtAscOrderVersionAsc(order.getId()).stream().anyMatch(t->caller.equals(t.getCourierId()));
    }

    private Order lockVisible(UUID orderId, UUID callerId) {
        Order order = orderRepository.findByIdForUpdate(orderId)
                .orElseThrow(() -> new OrderNotFoundException(orderId));
        if (!order.isVisibleTo(callerId)) {
            throw new OrderNotFoundException(orderId);
        }
        order.requireNoReview();
        return order;
    }

    /** Lazy expiry: an overdue OPEN order is expired and committed, then the action is rejected. */
    private void expireIfOverdue(Order order) {
        if (order.isOverdue(now())) {
            apply(order, order.expire(now()));
            throw new OrderExpiredOnActionException();
        }
    }

    /** True when the caller already moved the order into {@code target} with {@code action}. */
    private boolean alreadyIn(Order order, OrderState target, UUID callerId, OrderAction action) {
        return order.getState() == target
                && transitionRepository.findFirstByOrderIdOrderByOrderVersionDesc(order.getId())
                        .filter(record -> record.getAction() == action && callerId.equals(record.getActorId()))
                        .isPresent();
    }

    /** Orders that never reached the open pool, so outsiders cannot know they exist. */
    private static boolean neverListed(Order order) {
        return order.getState() == OrderState.PENDING_CREDIT || order.getState() == OrderState.RESERVATION_FAILED;
    }

    private boolean lastTransitionWasWithdrawalBy(UUID orderId, UUID callerId) {
        return transitionRepository.findFirstByOrderIdOrderByOrderVersionDesc(orderId)
                .filter(record -> record.getAction() == OrderAction.WITHDRAW && callerId.equals(record.getActorId()))
                .isPresent();
    }

    private boolean alreadyHandled(UUID orderId, OrderAction action) {
        return transitionRepository.findByOrderIdOrderByOccurredAtAscOrderVersionAsc(orderId).stream()
                .anyMatch(record -> record.getAction() == action);
    }

    private Order apply(Order order, OrderTransition transition) {
        return apply(order, transition, null);
    }

    /** {@code causationId}: the Credit event that caused the transition, or null for user and scheduler actions. */
    private Order apply(Order order, OrderTransition transition, UUID causationId) {
        // Flush first so the recorded aggregateVersion is the order's post-change version.
        Order saved = orderRepository.saveAndFlush(order);
        eventRecorder.record(saved, transition, causationId);
        return saved;
    }

    /** The current time at the precision PostgreSQL stores, so deadline checks match the database. */
    private OffsetDateTime now() {
        return Order.toStoredPrecision(OffsetDateTime.now(clock));
    }
}
