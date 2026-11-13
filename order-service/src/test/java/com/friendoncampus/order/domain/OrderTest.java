package com.friendoncampus.order.domain;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.time.Duration;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.UUID;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.junit.jupiter.params.provider.EnumSource;
import org.springframework.test.util.ReflectionTestUtils;

/** Phase 1 state machine: open, failReservation and cancel, including the deadline boundary. */
class OrderTest {

    private static final OffsetDateTime NOW = OffsetDateTime.of(2026, 10, 16, 12, 0, 0, 0, ZoneOffset.UTC);
    private static final UUID REQUESTER = UUID.fromString("97947588-bb2e-42f2-91ba-9abf8e15a8e7");
    private static final UUID COURIER = UUID.fromString("5b0f3c1e-8a52-4f8e-9d37-2c1b6e4a7f10");
    private static final UUID RESERVATION = UUID.fromString("0c5d1f7a-3e2b-4c69-8a1d-9f4e6b2c7d35");

    private static Order order(OrderState state, OffsetDateTime deadline) {
        Order order = Order.submit(REQUESTER, "Collect printing", "Grab my printout",
                UUID.randomUUID(), "COM1 Print Shop", UUID.randomUUID(), "UTown Residence", 10, deadline);
        ReflectionTestUtils.setField(order, "state", state);
        return order;
    }

    private static Order order(OrderState state) {
        return order(state, NOW.plusHours(2));
    }

    @Test
    void submittedRecordsAReserveRequestFromTheRequester() {
        OrderTransition transition = order(OrderState.PENDING_CREDIT).submitted(NOW);

        assertThat(transition.toState()).isEqualTo(OrderState.PENDING_CREDIT);
        assertThat(transition.actorId()).isEqualTo(REQUESTER);
        assertThat(transition.creditEffect()).isEqualTo(CreditEffect.RESERVE);
        assertThat(transition.eventType()).isEqualTo("OrderSubmitted");
    }

    @Test
    void openMovesAPendingOrderToOpenAndStoresTheReservation() {
        Order order = order(OrderState.PENDING_CREDIT);

        OrderTransition transition = order.open(RESERVATION, NOW);

        assertThat(order.getState()).isEqualTo(OrderState.OPEN);
        assertThat(order.getCreditReservationId()).isEqualTo(RESERVATION);
        assertThat(order.getStateChangedAt()).isEqualTo(NOW);
        assertThat(transition.fromState()).isEqualTo(OrderState.PENDING_CREDIT);
        assertThat(transition.actorRole()).isEqualTo(ActorRole.SYSTEM);
        assertThat(transition.creditEffect()).isEqualTo(CreditEffect.NONE);
        assertThat(transition.eventType()).isEqualTo("OrderOpened");
    }

    @Test
    void openOneMillisecondBeforeTheDeadlineStillOpens() {
        Order order = order(OrderState.PENDING_CREDIT, NOW.plusNanos(1_000_000));

        order.open(RESERVATION, NOW);

        assertThat(order.getState()).isEqualTo(OrderState.OPEN);
    }

    @Test
    void openExactlyAtTheDeadlineExpiresAndReleasesTheReservation() {
        Order order = order(OrderState.PENDING_CREDIT, NOW);

        OrderTransition transition = order.open(RESERVATION, NOW);

        assertThat(order.getState()).isEqualTo(OrderState.EXPIRED);
        assertThat(order.getTerminalReason()).isEqualTo(TerminalReason.PICKUP_DEADLINE_PASSED);
        assertThat(order.getExpiredAt()).isEqualTo(NOW);
        assertThat(order.getCreditReservationId()).isEqualTo(RESERVATION);
        assertThat(transition.creditEffect()).isEqualTo(CreditEffect.RELEASE);
        assertThat(transition.eventType()).isEqualTo("OrderExpired");
    }

    @ParameterizedTest
    @EnumSource(value = OrderState.class, names = "PENDING_CREDIT", mode = EnumSource.Mode.EXCLUDE)
    void openIsRejectedOutsidePendingCredit(OrderState state) {
        Order order = order(state);

        assertThatThrownBy(() -> order.open(RESERVATION, NOW))
                .isInstanceOfSatisfying(OrderTransitionException.class, exception -> {
                    assertThat(exception.getCode()).isEqualTo(OrderErrorCode.INVALID_STATE_TRANSITION);
                    assertThat(exception.getCurrentState()).isEqualTo(state);
                });
        assertThat(order.getState()).isEqualTo(state);
    }

    @Test
    void failReservationEndsAPendingOrder() {
        Order order = order(OrderState.PENDING_CREDIT);

        OrderTransition transition = order.failReservation(TerminalReason.INSUFFICIENT_CREDITS, NOW);

        assertThat(order.getState()).isEqualTo(OrderState.RESERVATION_FAILED);
        assertThat(order.getTerminalReason()).isEqualTo(TerminalReason.INSUFFICIENT_CREDITS);
        assertThat(transition.creditEffect()).isEqualTo(CreditEffect.NONE);
        assertThat(transition.eventType()).isEqualTo("OrderReservationFailed");
    }

    @ParameterizedTest
    @CsvSource(nullValues = "NULL", value = {
            "INSUFFICIENT_CREDITS, INSUFFICIENT_CREDITS",
            "CREDIT_ACCOUNT_NOT_FOUND, CREDIT_ACCOUNT_NOT_FOUND",
            "REQUEST_CONFLICT, CREDIT_RESERVATION_REJECTED",
            "NULL, CREDIT_RESERVATION_REJECTED"})
    void reservationRejectionReasonCodesMapToTerminalReasons(String reasonCode, TerminalReason expected) {
        assertThat(TerminalReason.forReservationRejection(reasonCode)).isEqualTo(expected);
    }

    @ParameterizedTest
    @EnumSource(value = OrderState.class, names = "PENDING_CREDIT", mode = EnumSource.Mode.EXCLUDE)
    void failReservationIsRejectedOutsidePendingCredit(OrderState state) {
        Order order = order(state);

        assertThatThrownBy(() -> order.failReservation(TerminalReason.INSUFFICIENT_CREDITS, NOW))
                .isInstanceOfSatisfying(OrderTransitionException.class, exception ->
                        assertThat(exception.getCode()).isEqualTo(OrderErrorCode.INVALID_STATE_TRANSITION));
        assertThat(order.getState()).isEqualTo(state);
    }

    @Test
    void requesterCancelsAnOpenOrderWithAFullRelease() {
        Order order = order(OrderState.OPEN);

        OrderTransition transition = order.cancel(REQUESTER, NOW);

        assertThat(order.getState()).isEqualTo(OrderState.CANCELLED);
        assertThat(order.getTerminalReason()).isEqualTo(TerminalReason.REQUESTER_CANCELLED_OPEN);
        assertThat(order.getCancelledAt()).isEqualTo(NOW);
        assertThat(transition.actorRole()).isEqualTo(ActorRole.REQUESTER);
        assertThat(transition.courierId()).isNull();
        assertThat(transition.creditEffect()).isEqualTo(CreditEffect.RELEASE);
    }

    @Test
    void requesterCancelsAnAcceptedOrderClearingTheCourierAndCompensatingThem() {
        Order order = order(OrderState.ACCEPTED);
        ReflectionTestUtils.setField(order, "courierId", COURIER);

        OrderTransition transition = order.cancel(REQUESTER, NOW);

        assertThat(order.getState()).isEqualTo(OrderState.CANCELLED);
        assertThat(order.getCourierId()).isNull();
        assertThat(order.getTerminalReason()).isEqualTo(TerminalReason.REQUESTER_CANCELLED_ACCEPTED);
        assertThat(transition.courierId()).isEqualTo(COURIER);
        assertThat(transition.creditEffect()).isEqualTo(CreditEffect.COMPENSATE);
    }

    @Test
    void cancellingAnAcceptedOrderJustBeforeTheDeadlineStillCompensatesTheCourier() {
        Order order = order(OrderState.ACCEPTED, NOW.plusNanos(1_000));
        ReflectionTestUtils.setField(order, "courierId", COURIER);

        OrderTransition transition = order.cancel(REQUESTER, NOW);

        assertThat(order.getTerminalReason()).isEqualTo(TerminalReason.REQUESTER_CANCELLED_ACCEPTED);
        assertThat(transition.creditEffect()).isEqualTo(CreditEffect.COMPENSATE);
    }

    @ParameterizedTest
    @CsvSource({"0", "1", "120"})
    void cancellingAnAcceptedOrderOnceTheCourierIsLateReleasesInFull(long minutesLate) {
        Order order = order(OrderState.ACCEPTED, NOW);
        ReflectionTestUtils.setField(order, "courierId", COURIER);

        OrderTransition transition = order.cancel(REQUESTER, NOW.plusMinutes(minutesLate));

        assertThat(order.getState()).isEqualTo(OrderState.CANCELLED);
        assertThat(order.getCourierId()).isNull();
        assertThat(order.getTerminalReason()).isEqualTo(TerminalReason.REQUESTER_CANCELLED_COURIER_LATE);
        assertThat(transition.courierId()).as("the late courier is still named in the history").isEqualTo(COURIER);
        assertThat(transition.creditEffect()).isEqualTo(CreditEffect.RELEASE);
        assertThat(transition.eventType()).isEqualTo("OrderCancelled");
    }

    @ParameterizedTest
    @EnumSource(value = OrderState.class, names = {"PICKED_UP", "DELIVERED", "COMPLETED"})
    void cancelIsNeverAllowedOncePickedUp(OrderState state) {
        Order order = order(state);
        ReflectionTestUtils.setField(order, "courierId", COURIER);

        assertThatThrownBy(() -> order.cancel(REQUESTER, NOW))
                .isInstanceOfSatisfying(OrderTransitionException.class, exception ->
                        assertThat(exception.getCode()).isEqualTo(OrderErrorCode.CANCELLATION_NOT_ALLOWED));
        assertThat(order.getState()).isEqualTo(state);
        assertThat(order.getCourierId()).isEqualTo(COURIER);
    }

    @ParameterizedTest
    @EnumSource(value = OrderState.class, names = {"PENDING_CREDIT", "CANCELLED", "EXPIRED", "RESERVATION_FAILED"})
    void cancelIsRejectedInStatesThatAreNotCancellable(OrderState state) {
        Order order = order(state);

        assertThatThrownBy(() -> order.cancel(REQUESTER, NOW))
                .isInstanceOfSatisfying(OrderTransitionException.class, exception ->
                        assertThat(exception.getCode()).isEqualTo(OrderErrorCode.INVALID_STATE_TRANSITION));
    }

    @Test
    void onlyTheRequesterCanCancel() {
        Order order = order(OrderState.OPEN);

        assertThatThrownBy(() -> order.cancel(COURIER, NOW))
                .isInstanceOfSatisfying(OrderTransitionException.class, exception ->
                        assertThat(exception.getCode()).isEqualTo(OrderErrorCode.NOT_ORDER_REQUESTER));
        assertThat(order.getState()).isEqualTo(OrderState.OPEN);
    }

    @Test
    void visibilityAllowsAnyoneOnOpenOrdersAndOnlyParticipantsOtherwise() {
        UUID stranger = UUID.randomUUID();
        Order open = order(OrderState.OPEN);
        Order accepted = order(OrderState.ACCEPTED);
        ReflectionTestUtils.setField(accepted, "courierId", COURIER);

        assertThat(open.isVisibleTo(stranger)).isTrue();
        assertThat(accepted.isVisibleTo(stranger)).isFalse();
        assertThat(accepted.isVisibleTo(REQUESTER)).isTrue();
        assertThat(accepted.isVisibleTo(COURIER)).isTrue();
    }

    // ---- Phase 2: expire, accept, withdraw ----

    @Test
    void expireEndsAnOverdueOpenOrderAndReleasesTheReservation() {
        Order order = order(OrderState.OPEN, NOW);

        OrderTransition transition = order.expire(NOW);

        assertThat(order.getState()).isEqualTo(OrderState.EXPIRED);
        assertThat(order.getTerminalReason()).isEqualTo(TerminalReason.PICKUP_DEADLINE_PASSED);
        assertThat(order.getExpiredAt()).isEqualTo(NOW);
        assertThat(transition.actorRole()).isEqualTo(ActorRole.SYSTEM);
        assertThat(transition.creditEffect()).isEqualTo(CreditEffect.RELEASE);
        assertThat(transition.eventType()).isEqualTo("OrderExpired");
    }

    @Test
    void expireIsRejectedOneMillisecondBeforeTheDeadline() {
        Order order = order(OrderState.OPEN, NOW.plusNanos(1_000_000));

        assertThatThrownBy(() -> order.expire(NOW)).isInstanceOf(OrderTransitionException.class);
        assertThat(order.getState()).isEqualTo(OrderState.OPEN);
    }

    @ParameterizedTest
    @EnumSource(value = OrderState.class, names = "OPEN", mode = EnumSource.Mode.EXCLUDE)
    void onlyOpenOrdersExpire(OrderState state) {
        Order order = order(state, NOW.minusHours(1));

        assertThatThrownBy(() -> order.expire(NOW))
                .isInstanceOfSatisfying(OrderTransitionException.class, exception ->
                        assertThat(exception.getCode()).isEqualTo(OrderErrorCode.INVALID_STATE_TRANSITION));
        assertThat(order.getState()).isEqualTo(state);
    }

    @Test
    void isOverdueOnlyForOpenOrdersAtOrPastTheDeadline() {
        assertThat(order(OrderState.OPEN, NOW).isOverdue(NOW)).isTrue();
        assertThat(order(OrderState.OPEN, NOW.plusNanos(1_000_000)).isOverdue(NOW)).isFalse();
        assertThat(order(OrderState.ACCEPTED, NOW.minusHours(1)).isOverdue(NOW)).isFalse();
    }

    @Test
    void aCourierAcceptsAnOpenOrderBeforeTheDeadline() {
        Order order = order(OrderState.OPEN, NOW.plusNanos(1_000_000));

        OrderTransition transition = order.accept(COURIER, NOW);

        assertThat(order.getState()).isEqualTo(OrderState.ACCEPTED);
        assertThat(order.getCourierId()).isEqualTo(COURIER);
        assertThat(order.getAcceptedAt()).isEqualTo(NOW);
        assertThat(transition.actorRole()).isEqualTo(ActorRole.COURIER);
        assertThat(transition.courierId()).isEqualTo(COURIER);
        assertThat(transition.creditEffect()).isEqualTo(CreditEffect.NONE);
        assertThat(transition.eventType()).isEqualTo("OrderAccepted");
    }

    @Test
    void acceptingExactlyAtTheDeadlineIsRejectedAsExpired() {
        Order order = order(OrderState.OPEN, NOW);

        assertThatThrownBy(() -> order.accept(COURIER, NOW))
                .isInstanceOfSatisfying(OrderTransitionException.class, exception ->
                        assertThat(exception.getCode()).isEqualTo(OrderErrorCode.ORDER_EXPIRED));
        assertThat(order.getCourierId()).isNull();
    }

    @Test
    void theRequesterCannotAcceptTheirOwnOrder() {
        Order order = order(OrderState.OPEN);

        assertThatThrownBy(() -> order.accept(REQUESTER, NOW))
                .isInstanceOfSatisfying(OrderTransitionException.class, exception ->
                        assertThat(exception.getCode()).isEqualTo(OrderErrorCode.SELF_ACCEPTANCE_FORBIDDEN));
        assertThat(order.getState()).isEqualTo(OrderState.OPEN);
    }

    @ParameterizedTest
    @EnumSource(value = OrderState.class, names = {"ACCEPTED", "PICKED_UP", "DELIVERED", "COMPLETED"})
    void acceptingAnOrderAnotherCourierHasIsRejectedAsAlreadyAccepted(OrderState state) {
        Order order = order(state);
        UUID winner = UUID.randomUUID();
        ReflectionTestUtils.setField(order, "courierId", winner);

        assertThatThrownBy(() -> order.accept(COURIER, NOW))
                .isInstanceOfSatisfying(OrderTransitionException.class, exception ->
                        assertThat(exception.getCode()).isEqualTo(OrderErrorCode.ORDER_ALREADY_ACCEPTED));
        assertThat(order.getCourierId()).isEqualTo(winner);
    }

    @Test
    void acceptingAnExpiredOrderGivesTheExpiryAsTheReason() {
        Order order = order(OrderState.EXPIRED);

        assertThatThrownBy(() -> order.accept(COURIER, NOW))
                .isInstanceOfSatisfying(OrderTransitionException.class, exception ->
                        assertThat(exception.getCode()).isEqualTo(OrderErrorCode.ORDER_EXPIRED));
    }

    @ParameterizedTest
    @EnumSource(value = OrderState.class, names = {"PENDING_CREDIT", "CANCELLED", "RESERVATION_FAILED"})
    void acceptIsRejectedInStatesThatAreNotInThePool(OrderState state) {
        Order order = order(state);

        assertThatThrownBy(() -> order.accept(COURIER, NOW))
                .isInstanceOfSatisfying(OrderTransitionException.class, exception ->
                        assertThat(exception.getCode()).isEqualTo(OrderErrorCode.INVALID_STATE_TRANSITION));
    }

    @Test
    void withdrawingBeforeTheDeadlineReopensTheOrderForOtherCouriers() {
        Order order = order(OrderState.ACCEPTED, NOW.plusNanos(1_000_000));
        ReflectionTestUtils.setField(order, "courierId", COURIER);

        OrderTransition transition = order.withdraw(COURIER, NOW);

        assertThat(order.getState()).isEqualTo(OrderState.OPEN);
        assertThat(order.getCourierId()).isNull();
        assertThat(order.getAcceptedAt()).isNull();
        assertThat(order.getTerminalReason()).isNull();
        assertThat(transition.courierId()).isEqualTo(COURIER);
        assertThat(transition.creditEffect()).isEqualTo(CreditEffect.NONE);
        assertThat(transition.eventType()).isEqualTo("OrderReopened");
    }

    @Test
    void withdrawingAtTheDeadlineExpiresTheOrderInsteadOfReopeningIt() {
        Order order = order(OrderState.ACCEPTED, NOW);
        ReflectionTestUtils.setField(order, "courierId", COURIER);

        OrderTransition transition = order.withdraw(COURIER, NOW);

        assertThat(order.getState()).isEqualTo(OrderState.EXPIRED);
        assertThat(order.getCourierId()).isNull();
        assertThat(order.getTerminalReason()).isEqualTo(TerminalReason.COURIER_WITHDREW_AFTER_DEADLINE);
        assertThat(transition.creditEffect()).isEqualTo(CreditEffect.RELEASE);
        assertThat(transition.eventType()).isEqualTo("OrderExpired");
    }

    @Test
    void onlyTheAssignedCourierCanWithdraw() {
        Order order = order(OrderState.ACCEPTED);
        ReflectionTestUtils.setField(order, "courierId", COURIER);

        assertThatThrownBy(() -> order.withdraw(UUID.randomUUID(), NOW))
                .isInstanceOfSatisfying(OrderTransitionException.class, exception ->
                        assertThat(exception.getCode()).isEqualTo(OrderErrorCode.NOT_ASSIGNED_COURIER));
        assertThatThrownBy(() -> order.withdraw(REQUESTER, NOW))
                .isInstanceOfSatisfying(OrderTransitionException.class, exception ->
                        assertThat(exception.getCode()).isEqualTo(OrderErrorCode.NOT_ASSIGNED_COURIER));
        assertThat(order.getCourierId()).isEqualTo(COURIER);
    }

    @ParameterizedTest
    @EnumSource(value = OrderState.class, names = {"PICKED_UP", "DELIVERED", "COMPLETED"})
    void couriersCannotWithdrawOncePickedUp(OrderState state) {
        Order order = order(state);
        ReflectionTestUtils.setField(order, "courierId", COURIER);

        assertThatThrownBy(() -> order.withdraw(COURIER, NOW))
                .isInstanceOfSatisfying(OrderTransitionException.class, exception ->
                        assertThat(exception.getCode()).isEqualTo(OrderErrorCode.CANCELLATION_NOT_ALLOWED));
        assertThat(order.getState()).isEqualTo(state);
        assertThat(order.getCourierId()).isEqualTo(COURIER);
    }

    @Test
    void aCourierWhoWithdrewMayAcceptTheSameOrderAgain() {
        Order order = order(OrderState.ACCEPTED, NOW.plusHours(1));
        ReflectionTestUtils.setField(order, "courierId", COURIER);
        order.withdraw(COURIER, NOW);

        order.accept(COURIER, NOW);

        assertThat(order.getState()).isEqualTo(OrderState.ACCEPTED);
        assertThat(order.getCourierId()).isEqualTo(COURIER);
    }

    // ---- Phase 3: pickUp, deliver, complete ----

    private static Order assigned(OrderState state) {
        Order order = order(state);
        ReflectionTestUtils.setField(order, "courierId", COURIER);
        return order;
    }

    @Test
    void theAssignedCourierPicksUpAnAcceptedOrder() {
        Order order = assigned(OrderState.ACCEPTED);

        OrderTransition transition = order.pickUp(COURIER, NOW);

        assertThat(order.getState()).isEqualTo(OrderState.PICKED_UP);
        assertThat(order.getPickedUpAt()).isEqualTo(NOW);
        assertThat(order.getCourierId()).isEqualTo(COURIER);
        assertThat(transition.creditEffect()).isEqualTo(CreditEffect.NONE);
        assertThat(transition.eventType()).isEqualTo("OrderPickedUp");
    }

    @Test
    void aLatePickupAfterTheDeadlineIsAllowed() {
        Order order = order(OrderState.ACCEPTED, NOW.minusHours(1));
        ReflectionTestUtils.setField(order, "courierId", COURIER);

        order.pickUp(COURIER, NOW);

        assertThat(order.getState()).isEqualTo(OrderState.PICKED_UP);
    }

    @Test
    void theAssignedCourierDeliversAPickedUpOrder() {
        Order order = assigned(OrderState.PICKED_UP);

        OrderTransition transition = order.deliver(COURIER, NOW);

        assertThat(order.getState()).isEqualTo(OrderState.DELIVERED);
        assertThat(order.getDeliveredAt()).isEqualTo(NOW);
        assertThat(transition.eventType()).isEqualTo("OrderDelivered");
    }

    @Test
    void theRequesterCompletesADeliveredOrderAndTheRewardIsSettledToTheCourier() {
        Order order = assigned(OrderState.DELIVERED);

        OrderTransition transition = order.complete(REQUESTER, NOW);

        assertThat(order.getState()).isEqualTo(OrderState.COMPLETED);
        assertThat(order.getCompletedAt()).isEqualTo(NOW);
        assertThat(order.getCourierId()).isEqualTo(COURIER);
        assertThat(transition.actorRole()).isEqualTo(ActorRole.REQUESTER);
        assertThat(transition.courierId()).isEqualTo(COURIER);
        assertThat(transition.creditEffect()).isEqualTo(CreditEffect.SETTLE);
        assertThat(transition.eventType()).isEqualTo("OrderCompleted");
    }

    @Test
    void onlyTheAssignedCourierCanPickUpOrDeliver() {
        Order accepted = assigned(OrderState.ACCEPTED);
        Order pickedUp = assigned(OrderState.PICKED_UP);

        for (UUID other : new UUID[] {REQUESTER, UUID.randomUUID()}) {
            assertThatThrownBy(() -> accepted.pickUp(other, NOW))
                    .isInstanceOfSatisfying(OrderTransitionException.class, exception ->
                            assertThat(exception.getCode()).isEqualTo(OrderErrorCode.NOT_ASSIGNED_COURIER));
            assertThatThrownBy(() -> pickedUp.deliver(other, NOW))
                    .isInstanceOfSatisfying(OrderTransitionException.class, exception ->
                            assertThat(exception.getCode()).isEqualTo(OrderErrorCode.NOT_ASSIGNED_COURIER));
        }
        assertThat(accepted.getState()).isEqualTo(OrderState.ACCEPTED);
        assertThat(pickedUp.getState()).isEqualTo(OrderState.PICKED_UP);
    }

    @Test
    void onlyTheRequesterCanConfirmReceipt() {
        Order order = assigned(OrderState.DELIVERED);

        assertThatThrownBy(() -> order.complete(COURIER, NOW))
                .isInstanceOfSatisfying(OrderTransitionException.class, exception ->
                        assertThat(exception.getCode()).isEqualTo(OrderErrorCode.NOT_ORDER_REQUESTER));
        assertThat(order.getState()).isEqualTo(OrderState.DELIVERED);
    }

    @ParameterizedTest
    @EnumSource(value = OrderState.class, names = "ACCEPTED", mode = EnumSource.Mode.EXCLUDE)
    void pickUpIsOnlyValidFromAccepted(OrderState state) {
        Order order = assigned(state);

        assertThatThrownBy(() -> order.pickUp(COURIER, NOW))
                .isInstanceOfSatisfying(OrderTransitionException.class, exception ->
                        assertThat(exception.getCode()).isEqualTo(OrderErrorCode.INVALID_STATE_TRANSITION));
        assertThat(order.getState()).isEqualTo(state);
    }

    @ParameterizedTest
    @EnumSource(value = OrderState.class, names = "PICKED_UP", mode = EnumSource.Mode.EXCLUDE)
    void deliverIsOnlyValidFromPickedUp(OrderState state) {
        Order order = assigned(state);

        assertThatThrownBy(() -> order.deliver(COURIER, NOW))
                .isInstanceOfSatisfying(OrderTransitionException.class, exception ->
                        assertThat(exception.getCode()).isEqualTo(OrderErrorCode.INVALID_STATE_TRANSITION));
        assertThat(order.getState()).isEqualTo(state);
    }

    @ParameterizedTest
    @EnumSource(value = OrderState.class, names = "DELIVERED", mode = EnumSource.Mode.EXCLUDE)
    void completeIsOnlyValidFromDelivered(OrderState state) {
        Order order = assigned(state);

        assertThatThrownBy(() -> order.complete(REQUESTER, NOW))
                .isInstanceOfSatisfying(OrderTransitionException.class, exception ->
                        assertThat(exception.getCode()).isEqualTo(OrderErrorCode.INVALID_STATE_TRANSITION));
        assertThat(order.getState()).isEqualTo(state);
    }

    @Test
    void theDeadlineIsKeptAtTheMicrosecondPrecisionThatIsStored() {
        Order order = order(OrderState.OPEN, NOW.plusNanos(700));

        // 700 ns would round up to 1 µs in PostgreSQL; truncating keeps memory and storage equal.
        assertThat(order.getPickupDeadline()).isEqualTo(NOW);
        assertThat(order.isPastDeadline(NOW)).isTrue();
    }

    private static Order pendingCreatedAt(OffsetDateTime createdAt, OffsetDateTime deadline) {
        Order order = order(OrderState.PENDING_CREDIT, deadline);
        order.stampCreatedAt(createdAt);
        return order;
    }

    @Test
    void theCreditTimeoutIsCreationPlusTheTimeoutOrTheDeadlineIfSooner() {
        Duration timeout = Duration.ofMinutes(2);

        assertThat(pendingCreatedAt(NOW, NOW.plusHours(2)).creditTimeoutAt(timeout)).isEqualTo(NOW.plusMinutes(2));
        assertThat(pendingCreatedAt(NOW, NOW.plusMinutes(1)).creditTimeoutAt(timeout)).isEqualTo(NOW.plusMinutes(1));
    }

    @Test
    void aTimedOutReservationExpiresThePendingOrderAndAsksForARelease() {
        Order order = pendingCreatedAt(NOW, NOW.plusHours(2));

        OrderTransition transition = order.timeOutCreditReservation(NOW.plusMinutes(2), NOW.plusMinutes(2));

        assertThat(order.getState()).isEqualTo(OrderState.EXPIRED);
        assertThat(order.getTerminalReason()).isEqualTo(TerminalReason.CREDIT_RESERVATION_TIMEOUT);
        assertThat(order.getExpiredAt()).isEqualTo(NOW.plusMinutes(2));
        assertThat(order.timedOutWaitingForCredit()).isTrue();
        assertThat(transition.action()).isEqualTo(OrderAction.EXPIRE);
        assertThat(transition.fromState()).isEqualTo(OrderState.PENDING_CREDIT);
        assertThat(transition.actorRole()).isEqualTo(ActorRole.SYSTEM);
        assertThat(transition.actorId()).isNull();
        assertThat(transition.creditEffect()).isEqualTo(CreditEffect.RELEASE);
        assertThat(transition.eventType()).isEqualTo("OrderExpired");
    }

    @Test
    void theCreditTimeoutIsNotReachedAMicrosecondEarly() {
        Order order = pendingCreatedAt(NOW, NOW.plusHours(2));

        assertThatThrownBy(() -> order.timeOutCreditReservation(NOW.plusMinutes(2), NOW.plusMinutes(2).minusNanos(1_000)))
                .isInstanceOf(OrderTransitionException.class);
        assertThat(order.getState()).isEqualTo(OrderState.PENDING_CREDIT);
    }

    @Test
    void onlyAPendingOrderCanTimeOutWaitingForCredit() {
        for (OrderState state : OrderState.values()) {
            if (state == OrderState.PENDING_CREDIT) {
                continue;
            }
            Order order = order(state);
            assertThatThrownBy(() -> order.timeOutCreditReservation(NOW, NOW.plusMinutes(5)))
                    .as(state.name())
                    .isInstanceOfSatisfying(OrderTransitionException.class, exception ->
                            assertThat(exception.getCode()).isEqualTo(OrderErrorCode.INVALID_STATE_TRANSITION));
            assertThat(order.getState()).isEqualTo(state);
        }
    }

    @Test
    void anOrderExpiredByItsPickupDeadlineDidNotTimeOutWaitingForCredit() {
        Order order = order(OrderState.OPEN, NOW.plusMinutes(1));
        order.expire(NOW.plusMinutes(1));

        assertThat(order.timedOutWaitingForCredit()).isFalse();
    }
}
