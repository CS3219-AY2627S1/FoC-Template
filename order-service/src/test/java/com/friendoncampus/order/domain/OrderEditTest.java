package com.friendoncampus.order.domain;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.UUID;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.EnumSource;
import org.springframework.test.util.ReflectionTestUtils;

/** Editing an OPEN order (T4), requesting a reward change (T5) and Credit's answers (T5a, T5b). */
class OrderEditTest {

    private static final OffsetDateTime NOW = OffsetDateTime.of(2026, 10, 16, 12, 0, 0, 0, ZoneOffset.UTC);
    private static final UUID REQUESTER = UUID.fromString("97947588-bb2e-42f2-91ba-9abf8e15a8e7");
    private static final UUID COURIER = UUID.fromString("5b0f3c1e-8a52-4f8e-9d37-2c1b6e4a7f10");
    private static final UUID PICKUP = UUID.fromString("9fd58f13-c8d5-4320-b757-7893d69a4ae0");
    private static final UUID DROPOFF = UUID.fromString("eb46dc78-e25e-4f07-a7a2-26bff615d170");
    private static final OffsetDateTime DEADLINE = NOW.plusHours(2);

    private static Order order(OrderState state) {
        Order order = Order.submit(REQUESTER, "Collect printing", "Grab my printout",
                PICKUP, "COM1 Print Shop", DROPOFF, "UTown Residence", 10, DEADLINE);
        ReflectionTestUtils.setField(order, "state", state);
        ReflectionTestUtils.setField(order, "version", 3L);
        return order;
    }

    private static OrderDetails details(int reward) {
        return new OrderDetails("Collect lecture notes", "From the COM2 office", DROPOFF, "COM2 Office",
                PICKUP, "Science Library", reward, NOW.plusHours(3));
    }

    private static OrderDetails unchanged(int reward) {
        return new OrderDetails("Collect printing", "Grab my printout", PICKUP, "COM1 Print Shop", DROPOFF,
                "UTown Residence", reward, DEADLINE);
    }

    private static void assertRejected(Runnable action, OrderErrorCode code) {
        assertThatThrownBy(action::run)
                .isInstanceOfSatisfying(OrderTransitionException.class, exception ->
                        assertThat(exception.getCode()).isEqualTo(code));
    }

    @Test
    void editingDetailsAppliesThemAtOnceWithNoCreditEffect() {
        Order order = order(OrderState.OPEN);

        OrderTransition transition = order.edit(REQUESTER, 3, details(10), NOW).orElseThrow();

        assertThat(order.getTitle()).isEqualTo("Collect lecture notes");
        assertThat(order.getDescription()).isEqualTo("From the COM2 office");
        assertThat(order.getPickupLocationId()).isEqualTo(DROPOFF);
        assertThat(order.getPickupLocationName()).isEqualTo("COM2 Office");
        assertThat(order.getDropoffLocationId()).isEqualTo(PICKUP);
        assertThat(order.getDropoffLocationName()).isEqualTo("Science Library");
        assertThat(order.getPickupDeadline()).isEqualTo(NOW.plusHours(3));
        assertThat(order.getCreditReward()).isEqualTo(10);
        assertThat(order.getPendingCreditReward()).isNull();
        assertThat(order.getState()).isEqualTo(OrderState.OPEN);
        assertThat(transition.action()).isEqualTo(OrderAction.EDIT);
        assertThat(transition.fromState()).isEqualTo(OrderState.OPEN);
        assertThat(transition.toState()).isEqualTo(OrderState.OPEN);
        assertThat(transition.actorRole()).isEqualTo(ActorRole.REQUESTER);
        assertThat(transition.creditEffect()).isEqualTo(CreditEffect.NONE);
    }

    @Test
    void changingTheRewardMakesItPendingAndKeepsTheCurrentReward() {
        Order order = order(OrderState.OPEN);

        OrderTransition transition = order.edit(REQUESTER, 3, details(15), NOW).orElseThrow();

        assertThat(order.getCreditReward()).isEqualTo(10);
        assertThat(order.getPendingCreditReward()).isEqualTo(15);
        assertThat(order.isRewardAdjustmentPending()).isTrue();
        assertThat(order.getTitle()).isEqualTo("Collect lecture notes");
        assertThat(transition.creditEffect()).isEqualTo(CreditEffect.ADJUST);
        assertThat(transition.eventType()).isEqualTo("OrderRewardChangeRequested");
    }

    @Test
    void resendingWhatTheOrderHoldsChangesNothingWhateverTheVersion() {
        Order order = order(OrderState.OPEN);

        assertThat(order.edit(REQUESTER, 0, unchanged(10), NOW)).isEmpty();

        order.edit(REQUESTER, 3, unchanged(15), NOW);
        // A retry of the reward edit while it is pending is a duplicate, not REWARD_ADJUSTMENT_PENDING.
        assertThat(order.edit(REQUESTER, 3, unchanged(15), NOW)).isEmpty();
        assertThat(order.getPendingCreditReward()).isEqualTo(15);
    }

    @Test
    void onlyTheRequesterMayEdit() {
        Order order = order(OrderState.OPEN);

        assertRejected(() -> order.edit(COURIER, 3, details(15), NOW), OrderErrorCode.NOT_ORDER_REQUESTER);
        assertThat(order.getTitle()).isEqualTo("Collect printing");
    }

    @ParameterizedTest
    @EnumSource(value = OrderState.class, names = "OPEN", mode = EnumSource.Mode.EXCLUDE)
    void editIsRejectedOutsideOpen(OrderState state) {
        Order order = order(state);

        assertThatThrownBy(() -> order.edit(REQUESTER, 3, details(15), NOW))
                .isInstanceOfSatisfying(OrderTransitionException.class, exception -> {
                    assertThat(exception.getCode()).isEqualTo(OrderErrorCode.INVALID_STATE_TRANSITION);
                    assertThat(exception.getCurrentState()).isEqualTo(state);
                });
        assertThat(order.getTitle()).isEqualTo("Collect printing");
        assertThat(order.getPendingCreditReward()).isNull();
    }

    @Test
    void aSecondEditIsRejectedWhileARewardChangeIsPending() {
        Order order = order(OrderState.OPEN);
        order.edit(REQUESTER, 3, unchanged(15), NOW);

        assertRejected(() -> order.edit(REQUESTER, 3, details(15), NOW), OrderErrorCode.REWARD_ADJUSTMENT_PENDING);
        assertRejected(() -> order.edit(REQUESTER, 3, unchanged(20), NOW), OrderErrorCode.REWARD_ADJUSTMENT_PENDING);
        assertThat(order.getTitle()).isEqualTo("Collect printing");
        assertThat(order.getPendingCreditReward()).isEqualTo(15);
    }

    @Test
    void aStaleVersionIsAConflictCarryingTheCurrentVersion() {
        Order order = order(OrderState.OPEN);

        assertThatThrownBy(() -> order.edit(REQUESTER, 2, details(15), NOW))
                .isInstanceOfSatisfying(OrderVersionConflictException.class, exception -> {
                    assertThat(exception.getCode()).isEqualTo(OrderErrorCode.VERSION_CONFLICT);
                    assertThat(exception.getCurrentVersion()).isEqualTo(3);
                });
        assertThat(order.getTitle()).isEqualTo("Collect printing");
    }

    @Test
    void theNewDeadlineMustBeInTheFuture() {
        Order order = order(OrderState.OPEN);
        OrderDetails atNow = new OrderDetails("Collect printing", "Grab my printout", PICKUP, "COM1 Print Shop",
                DROPOFF, "UTown Residence", 10, NOW);

        assertRejected(() -> order.edit(REQUESTER, 3, atNow, NOW), OrderErrorCode.INVALID_PICKUP_DEADLINE);
        assertThat(order.getPickupDeadline()).isEqualTo(DEADLINE);
    }

    @Test
    void anOrderCannotBeAcceptedWhileARewardChangeIsPending() {
        Order order = order(OrderState.OPEN);
        order.edit(REQUESTER, 3, unchanged(15), NOW);

        assertRejected(() -> order.accept(COURIER, NOW), OrderErrorCode.REWARD_ADJUSTMENT_PENDING);
        assertThat(order.getState()).isEqualTo(OrderState.OPEN);
        assertThat(order.getCourierId()).isNull();
    }

    @Test
    void creditAdjustedAppliesThePendingReward() {
        Order order = order(OrderState.OPEN);
        order.edit(REQUESTER, 3, unchanged(15), NOW);

        OrderTransition transition = order.applyRewardChange(15, NOW);

        assertThat(order.getCreditReward()).isEqualTo(15);
        assertThat(order.getPendingCreditReward()).isNull();
        assertThat(transition.action()).isEqualTo(OrderAction.REWARD_CHANGE_APPLIED);
        assertThat(transition.actorRole()).isEqualTo(ActorRole.SYSTEM);
        assertThat(transition.creditEffect()).isEqualTo(CreditEffect.NONE);
        // Accepting works again once the reward is settled.
        order.accept(COURIER, NOW);
        assertThat(order.getState()).isEqualTo(OrderState.ACCEPTED);
    }

    @Test
    void creditAdjustmentRejectedKeepsThePreviousReward() {
        Order order = order(OrderState.OPEN);
        order.edit(REQUESTER, 3, unchanged(15), NOW);

        OrderTransition transition = order.rejectRewardChange(15, NOW);

        assertThat(order.getCreditReward()).isEqualTo(10);
        assertThat(order.getPendingCreditReward()).isNull();
        assertThat(transition.action()).isEqualTo(OrderAction.REWARD_CHANGE_REJECTED);
        assertThat(transition.creditEffect()).isEqualTo(CreditEffect.NONE);
    }

    @Test
    void anAnswerForADifferentRewardOrNoPendingChangeIsNotAwaited() {
        Order order = order(OrderState.OPEN);
        assertThat(order.awaitsRewardChange(10)).isFalse();
        order.edit(REQUESTER, 3, unchanged(15), NOW);

        assertThat(order.awaitsRewardChange(20)).isFalse();
        assertThat(order.awaitsRewardChange(15)).isTrue();
        assertRejected(() -> order.applyRewardChange(20, NOW), OrderErrorCode.INVALID_STATE_TRANSITION);
        assertThat(order.getPendingCreditReward()).isEqualTo(15);
    }

    @Test
    void cancellingOrExpiringClearsAPendingReward() {
        Order cancelled = order(OrderState.OPEN);
        cancelled.edit(REQUESTER, 3, unchanged(15), NOW);
        OrderTransition cancel = cancelled.cancel(REQUESTER, NOW);
        assertThat(cancelled.getPendingCreditReward()).isNull();
        assertThat(cancelled.getCreditReward()).isEqualTo(10);
        assertThat(cancel.creditEffect()).isEqualTo(CreditEffect.RELEASE);
        assertThat(cancelled.awaitsRewardChange(15)).isFalse();

        Order expired = order(OrderState.OPEN);
        expired.edit(REQUESTER, 3, unchanged(15), NOW);
        expired.expire(DEADLINE);
        assertThat(expired.getPendingCreditReward()).isNull();
        assertThat(expired.awaitsRewardChange(15)).isFalse();
    }
}
