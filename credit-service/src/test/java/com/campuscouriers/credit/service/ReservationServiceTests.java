/*
 * AI Assistance Disclosure
 * Tool: Anthropic Claude (model unrecorded), date: 2026-11-10
 * Scope (AI-61): Generated unit tests for ReservationService, including scenarios for reserving, adjusting, releasing, and completing reservations
 * Author review: Code changes were checked and validated
 */

package com.campuscouriers.credit.service;

import com.campuscouriers.credit.dto.ReservationResponse;
import com.campuscouriers.credit.entity.Reservation;
import com.campuscouriers.credit.entity.ReservationStatus;
import com.campuscouriers.credit.entity.Wallet;
import com.campuscouriers.credit.entity.WalletStatus;
import com.campuscouriers.credit.exception.DuplicateReservationException;
import com.campuscouriers.credit.exception.IllegalWalletException;
import com.campuscouriers.credit.exception.InsufficientCreditsException;
import com.campuscouriers.credit.exception.InvalidReservationStateException;
import com.campuscouriers.credit.exception.ReservationNotFoundException;
import com.campuscouriers.credit.exception.WalletNotFoundException;
import com.campuscouriers.credit.exception.WalletSuspendedException;
import com.campuscouriers.credit.repository.ReservationRepository;
import com.campuscouriers.credit.repository.WalletRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.mockito.InOrder;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.web.server.ResponseStatusException;

import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.Mockito.inOrder;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.spy;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

class ReservationServiceTests {

    private WalletRepository walletRepository;
    private ReservationRepository reservationRepository;
    private CreditRecordsService creditRecordsService;
    private WalletService walletService;
    private ReservationService reservationService;

    @BeforeEach
    void setUp() {
        walletRepository = mock(WalletRepository.class);
        reservationRepository = mock(ReservationRepository.class);
        creditRecordsService = mock(CreditRecordsService.class);
        // The real balance rules, so tests can check the wallets' balances afterwards.
        walletService = spy(new WalletService(walletRepository));
        reservationService = new ReservationService(
                walletRepository, reservationRepository, creditRecordsService, walletService);
        when(reservationRepository.save(any(Reservation.class))).thenAnswer(invocation -> {
            Reservation saved = invocation.getArgument(0);
            if (saved.getReservationId() == null) {
                ReflectionTestUtils.setField(saved, "reservationId", UUID.randomUUID());
            }
            return saved;
        });
    }

    private Wallet wallet(long available, long reserved, WalletStatus status) {
        return wallet(UUID.randomUUID(), available, reserved, status);
    }

    private Wallet wallet(UUID walletId, long available, long reserved, WalletStatus status) {
        Wallet wallet = new Wallet(UUID.randomUUID(), available, status);
        wallet.setReserveBalance(reserved);
        ReflectionTestUtils.setField(wallet, "walletId", walletId);
        when(walletRepository.findWithLockByWalletId(walletId)).thenReturn(Optional.of(wallet));
        when(walletRepository.findById(walletId)).thenReturn(Optional.of(wallet));
        when(walletRepository.findByUserUuid(wallet.getUserUuid())).thenReturn(Optional.of(wallet));
        when(walletRepository.findWithLockByUserUuid(wallet.getUserUuid())).thenReturn(Optional.of(wallet));
        return wallet;
    }

    private Reservation reservation(Wallet owner, UUID orderId, long amount, ReservationStatus status) {
        Reservation reservation = new Reservation(owner.getWalletId(), orderId, amount);
        reservation.setStatus(status);
        UUID reservationId = UUID.randomUUID();
        ReflectionTestUtils.setField(reservation, "reservationId", reservationId);
        when(reservationRepository.findWithLockByReservationId(reservationId)).thenReturn(Optional.of(reservation));
        when(reservationRepository.findById(reservationId)).thenReturn(Optional.of(reservation));
        when(reservationRepository.findByOrderId(orderId)).thenReturn(Optional.of(reservation));
        return reservation;
    }

    @Nested
    class ReserveCredits {

        @Test
        void holdsCreditsRecordsHistoryAndSavesReservation() {
            Wallet requester = wallet(30, 0, WalletStatus.ACTIVE);
            UUID orderId = UUID.randomUUID();
            when(reservationRepository.findByOrderId(orderId)).thenReturn(Optional.empty());

            ReservationResponse response = reservationService.reserveCredits(requester.getUserUuid(), orderId, 10);

            assertThat(response.reservationId()).isNotNull();
            assertThat(response.orderId()).isEqualTo(orderId);
            assertThat(response.amount()).isEqualTo(10);
            assertThat(response.status()).isEqualTo(ReservationStatus.HELD);
            assertThat(requester.getAvailableBalance()).isEqualTo(20);
            assertThat(requester.getReserveBalance()).isEqualTo(10);
            verify(creditRecordsService).recordReserved(requester, orderId, 10);
        }

        @Test
        void retryWithSameDetailsReturnsExistingReservationWithoutChargingAgain() {
            Wallet requester = wallet(20, 10, WalletStatus.ACTIVE);
            UUID orderId = UUID.randomUUID();
            Reservation existing = reservation(requester, orderId, 10, ReservationStatus.HELD);

            ReservationResponse response = reservationService.reserveCredits(requester.getUserUuid(), orderId, 10);

            assertThat(response.reservationId()).isEqualTo(existing.getReservationId());
            assertThat(requester.getAvailableBalance()).isEqualTo(20);
            assertThat(requester.getReserveBalance()).isEqualTo(10);
            verify(walletService, never()).reserve(any(), anyLong());
            verify(reservationRepository, never()).save(any());
            verifyNoInteractions(creditRecordsService);
        }

        @Test
        void sameOrderWithDifferentAmountIsRejected() {
            Wallet requester = wallet(20, 10, WalletStatus.ACTIVE);
            UUID orderId = UUID.randomUUID();
            reservation(requester, orderId, 10, ReservationStatus.HELD);

            assertThatThrownBy(() -> reservationService.reserveCredits(requester.getUserUuid(), orderId, 11))
                    .isInstanceOf(DuplicateReservationException.class);
            verifyNoInteractions(creditRecordsService);
        }

        @Test
        void sameOrderFromAnotherWalletIsRejected() {
            Wallet owner = wallet(20, 10, WalletStatus.ACTIVE);
            Wallet other = wallet(30, 0, WalletStatus.ACTIVE);
            UUID orderId = UUID.randomUUID();
            reservation(owner, orderId, 10, ReservationStatus.HELD);

            assertThatThrownBy(() -> reservationService.reserveCredits(other.getUserUuid(), orderId, 10))
                    .isInstanceOf(DuplicateReservationException.class);
            assertThat(other.getAvailableBalance()).isEqualTo(30);
        }

        @Test
        void retryAfterReservationWasReleasedIsRejected() {
            Wallet requester = wallet(30, 0, WalletStatus.ACTIVE);
            UUID orderId = UUID.randomUUID();
            reservation(requester, orderId, 10, ReservationStatus.RELEASED);

            assertThatThrownBy(() -> reservationService.reserveCredits(requester.getUserUuid(), orderId, 10))
                    .isInstanceOf(InvalidReservationStateException.class);
        }

        @Test
        void insufficientCreditsLeavesNoRecordOrReservation() {
            Wallet requester = wallet(5, 0, WalletStatus.ACTIVE);
            UUID orderId = UUID.randomUUID();
            when(reservationRepository.findByOrderId(orderId)).thenReturn(Optional.empty());

            assertThatThrownBy(() -> reservationService.reserveCredits(requester.getUserUuid(), orderId, 10))
                    .isInstanceOf(InsufficientCreditsException.class);
            verifyNoInteractions(creditRecordsService);
            verify(reservationRepository, never()).save(any());
        }

        @Test
        void unknownRequesterIsRejected() {
            UUID userId = UUID.randomUUID();
            when(walletRepository.findWithLockByUserUuid(userId)).thenReturn(Optional.empty());

            assertThatThrownBy(() -> reservationService.reserveCredits(userId, UUID.randomUUID(), 10))
                    .isInstanceOf(WalletNotFoundException.class);
        }
    }

    @Nested
    class AdjustReservation {

        @Test
        void increaseHoldsTheDifference() {
            Wallet requester = wallet(20, 10, WalletStatus.ACTIVE);
            Reservation held = reservation(requester, UUID.randomUUID(), 10, ReservationStatus.HELD);

            ReservationResponse response = reservationService.adjustReservation(held.getReservationId(), 15);

            assertThat(response.amount()).isEqualTo(15);
            assertThat(requester.getAvailableBalance()).isEqualTo(15);
            assertThat(requester.getReserveBalance()).isEqualTo(15);
        }

        @Test
        void decreaseReturnsTheDifference() {
            Wallet requester = wallet(20, 10, WalletStatus.ACTIVE);
            Reservation held = reservation(requester, UUID.randomUUID(), 10, ReservationStatus.HELD);

            reservationService.adjustReservation(held.getReservationId(), 4);

            assertThat(held.getAmount()).isEqualTo(4);
            assertThat(requester.getAvailableBalance()).isEqualTo(26);
            assertThat(requester.getReserveBalance()).isEqualTo(4);
        }

        @Test
        void sameAmountChangesNothing() {
            Wallet requester = wallet(20, 10, WalletStatus.ACTIVE);
            Reservation held = reservation(requester, UUID.randomUUID(), 10, ReservationStatus.HELD);

            reservationService.adjustReservation(held.getReservationId(), 10);

            assertThat(requester.getAvailableBalance()).isEqualTo(20);
            assertThat(requester.getReserveBalance()).isEqualTo(10);
            verify(walletService, never()).reserve(any(), anyLong());
            verify(walletService, never()).release(any(), anyLong());
        }

        @Test
        void increaseBeyondAvailableBalanceIsRejected() {
            Wallet requester = wallet(3, 10, WalletStatus.ACTIVE);
            Reservation held = reservation(requester, UUID.randomUUID(), 10, ReservationStatus.HELD);

            assertThatThrownBy(() -> reservationService.adjustReservation(held.getReservationId(), 14))
                    .isInstanceOf(InsufficientCreditsException.class);
            assertThat(held.getAmount()).isEqualTo(10);
        }

        @Test
        void releasedReservationCannotBeAdjusted() {
            Wallet requester = wallet(30, 0, WalletStatus.ACTIVE);
            Reservation released = reservation(requester, UUID.randomUUID(), 10, ReservationStatus.RELEASED);

            assertThatThrownBy(() -> reservationService.adjustReservation(released.getReservationId(), 5))
                    .isInstanceOf(InvalidReservationStateException.class);
        }

        @Test
        void suspendedWalletCannotAdjust() {
            Wallet requester = wallet(20, 10, WalletStatus.SUSPENDED);
            Reservation held = reservation(requester, UUID.randomUUID(), 10, ReservationStatus.HELD);

            assertThatThrownBy(() -> reservationService.adjustReservation(held.getReservationId(), 5))
                    .isInstanceOf(WalletSuspendedException.class);
            assertThat(requester.getReserveBalance()).isEqualTo(10);
        }

        @Test
        void unknownReservationIsRejected() {
            when(reservationRepository.findWithLockByReservationId(any())).thenReturn(Optional.empty());

            assertThatThrownBy(() -> reservationService.adjustReservation(UUID.randomUUID(), 5))
                    .isInstanceOf(ReservationNotFoundException.class);
        }
    }

    @Nested
    class ReleaseReservation {

        @Test
        void returnsHeldCreditsAndRecordsRelease() {
            Wallet requester = wallet(20, 10, WalletStatus.ACTIVE);
            UUID orderId = UUID.randomUUID();
            Reservation held = reservation(requester, orderId, 10, ReservationStatus.HELD);

            ReservationResponse response = reservationService.releaseReservation(held.getReservationId());

            assertThat(response.status()).isEqualTo(ReservationStatus.RELEASED);
            assertThat(requester.getAvailableBalance()).isEqualTo(30);
            assertThat(requester.getReserveBalance()).isZero();
            verify(creditRecordsService).recordReleased(requester, orderId, 10);
        }

        @Test
        void releasingTwiceIsASafeNoOp() {
            Wallet requester = wallet(30, 0, WalletStatus.ACTIVE);
            Reservation released = reservation(requester, UUID.randomUUID(), 10, ReservationStatus.RELEASED);

            ReservationResponse response = reservationService.releaseReservation(released.getReservationId());

            assertThat(response.status()).isEqualTo(ReservationStatus.RELEASED);
            assertThat(requester.getAvailableBalance()).isEqualTo(30);
            verifyNoInteractions(creditRecordsService);
        }

        @Test
        void transferredReservationCannotBeReleased() {
            Wallet requester = wallet(20, 0, WalletStatus.ACTIVE);
            Reservation transferred = reservation(requester, UUID.randomUUID(), 10, ReservationStatus.TRANSFERRED);

            assertThatThrownBy(() -> reservationService.releaseReservation(transferred.getReservationId()))
                    .isInstanceOf(InvalidReservationStateException.class);
            verifyNoInteractions(creditRecordsService);
        }

        @Test
        void suspendedWalletStillGetsCreditsBack() {
            Wallet requester = wallet(0, 10, WalletStatus.SUSPENDED);
            Reservation held = reservation(requester, UUID.randomUUID(), 10, ReservationStatus.HELD);

            reservationService.releaseReservation(held.getReservationId());

            assertThat(requester.getAvailableBalance()).isEqualTo(10);
        }
    }

    @Nested
    class CompleteReservation {

        @Test
        void paysCourierFromRequesterReserveAndRecordsBothSides() {
            Wallet requester = wallet(20, 10, WalletStatus.ACTIVE);
            Wallet courier = wallet(5, 0, WalletStatus.ACTIVE);
            UUID orderId = UUID.randomUUID();
            Reservation held = reservation(requester, orderId, 10, ReservationStatus.HELD);

            ReservationResponse response = reservationService.completeReservation(
                    held.getReservationId(), courier.getUserUuid(), orderId);

            assertThat(response.status()).isEqualTo(ReservationStatus.TRANSFERRED);
            assertThat(held.getCourierWalletId()).isEqualTo(courier.getWalletId());
            assertThat(requester.getAvailableBalance()).isEqualTo(20);
            assertThat(requester.getReserveBalance()).isZero();
            assertThat(courier.getAvailableBalance()).isEqualTo(15);
            assertThat(courier.getReserveBalance()).isZero();
            verify(creditRecordsService).recordTransferred(requester, courier, orderId, 10);
            verify(creditRecordsService).recordReceived(courier, requester, orderId, 10);
        }

        @Test
        void courierCanBeSuspendedAndStillGetPaid() {
            Wallet requester = wallet(20, 10, WalletStatus.ACTIVE);
            Wallet courier = wallet(0, 0, WalletStatus.SUSPENDED);
            UUID orderId = UUID.randomUUID();
            Reservation held = reservation(requester, orderId, 10, ReservationStatus.HELD);

            reservationService.completeReservation(held.getReservationId(), courier.getUserUuid(), orderId);

            assertThat(courier.getAvailableBalance()).isEqualTo(10);
        }

        @Test
        void locksWalletsInAscendingWalletIdOrder() {
            UUID lowId = new UUID(0, 1);
            UUID highId = new UUID(0, 2);
            // Requester has the higher id, so the courier's wallet must be locked first.
            Wallet requester = wallet(highId, 20, 10, WalletStatus.ACTIVE);
            Wallet courier = wallet(lowId, 0, 0, WalletStatus.ACTIVE);
            UUID orderId = UUID.randomUUID();
            Reservation held = reservation(requester, orderId, 10, ReservationStatus.HELD);

            reservationService.completeReservation(held.getReservationId(), courier.getUserUuid(), orderId);

            InOrder locks = inOrder(walletRepository);
            locks.verify(walletRepository).findWithLockByWalletId(lowId);
            locks.verify(walletRepository).findWithLockByWalletId(highId);
        }

        @Test
        void mismatchedOrderIsRejectedBeforeTouchingWallets() {
            Wallet requester = wallet(20, 10, WalletStatus.ACTIVE);
            Reservation held = reservation(requester, UUID.randomUUID(), 10, ReservationStatus.HELD);

            assertThatThrownBy(() -> reservationService.completeReservation(
                    held.getReservationId(), UUID.randomUUID(), UUID.randomUUID()))
                    .isInstanceOfSatisfying(ResponseStatusException.class,
                            error -> assertThat(error.getStatusCode().value()).isEqualTo(409));
            assertThat(requester.getReserveBalance()).isEqualTo(10);
            verify(walletService, never()).deductFromReserve(any(), anyLong());
            verifyNoInteractions(creditRecordsService);
        }

        @Test
        void retryForSameCourierIsASafeNoOp() {
            Wallet requester = wallet(20, 0, WalletStatus.ACTIVE);
            Wallet courier = wallet(15, 0, WalletStatus.ACTIVE);
            UUID orderId = UUID.randomUUID();
            Reservation transferred = reservation(requester, orderId, 10, ReservationStatus.TRANSFERRED);
            transferred.setCourierWalletId(courier.getWalletId());

            ReservationResponse response = reservationService.completeReservation(
                    transferred.getReservationId(), courier.getUserUuid(), orderId);

            assertThat(response.status()).isEqualTo(ReservationStatus.TRANSFERRED);
            assertThat(courier.getAvailableBalance()).isEqualTo(15);
            verifyNoInteractions(creditRecordsService);
        }

        @Test
        void retryForDifferentCourierIsRejected() {
            Wallet requester = wallet(20, 0, WalletStatus.ACTIVE);
            Wallet courier = wallet(15, 0, WalletStatus.ACTIVE);
            Wallet otherCourier = wallet(0, 0, WalletStatus.ACTIVE);
            UUID orderId = UUID.randomUUID();
            Reservation transferred = reservation(requester, orderId, 10, ReservationStatus.TRANSFERRED);
            transferred.setCourierWalletId(courier.getWalletId());

            assertThatThrownBy(() -> reservationService.completeReservation(
                    transferred.getReservationId(), otherCourier.getUserUuid(), orderId))
                    .isInstanceOf(InvalidReservationStateException.class);
            assertThat(otherCourier.getAvailableBalance()).isZero();
        }

        @Test
        void releasedReservationCannotBeCompleted() {
            Wallet requester = wallet(30, 0, WalletStatus.ACTIVE);
            Wallet courier = wallet(0, 0, WalletStatus.ACTIVE);
            UUID orderId = UUID.randomUUID();
            Reservation released = reservation(requester, orderId, 10, ReservationStatus.RELEASED);

            assertThatThrownBy(() -> reservationService.completeReservation(
                    released.getReservationId(), courier.getUserUuid(), orderId))
                    .isInstanceOf(InvalidReservationStateException.class);
            assertThat(courier.getAvailableBalance()).isZero();
        }

        @Test
        void requesterCannotPayThemselves() {
            Wallet requester = wallet(20, 10, WalletStatus.ACTIVE);
            UUID orderId = UUID.randomUUID();
            Reservation held = reservation(requester, orderId, 10, ReservationStatus.HELD);

            assertThatThrownBy(() -> reservationService.completeReservation(
                    held.getReservationId(), requester.getUserUuid(), orderId))
                    .isInstanceOf(IllegalWalletException.class);
            assertThat(requester.getReserveBalance()).isEqualTo(10);
        }

        @Test
        void unknownCourierIsRejected() {
            Wallet requester = wallet(20, 10, WalletStatus.ACTIVE);
            UUID orderId = UUID.randomUUID();
            Reservation held = reservation(requester, orderId, 10, ReservationStatus.HELD);
            UUID unknownCourier = UUID.randomUUID();
            when(walletRepository.findByUserUuid(unknownCourier)).thenReturn(Optional.empty());

            assertThatThrownBy(() -> reservationService.completeReservation(
                    held.getReservationId(), unknownCourier, orderId))
                    .isInstanceOf(WalletNotFoundException.class);
        }
    }

    @Nested
    class AssertOwnedBy {

        @Test
        void passesForTheRequester() {
            Wallet requester = wallet(20, 10, WalletStatus.ACTIVE);
            Reservation held = reservation(requester, UUID.randomUUID(), 10, ReservationStatus.HELD);

            reservationService.assertOwnedBy(held.getReservationId(), requester.getUserUuid());
        }

        @Test
        void rejectsAnotherUser() {
            Wallet requester = wallet(20, 10, WalletStatus.ACTIVE);
            Wallet other = wallet(30, 0, WalletStatus.ACTIVE);
            Reservation held = reservation(requester, UUID.randomUUID(), 10, ReservationStatus.HELD);

            assertThatThrownBy(() -> reservationService.assertOwnedBy(held.getReservationId(), other.getUserUuid()))
                    .isInstanceOfSatisfying(ResponseStatusException.class,
                            error -> assertThat(error.getStatusCode().value()).isEqualTo(403));
        }

        @Test
        void rejectsUserWithoutWallet() {
            Wallet requester = wallet(20, 10, WalletStatus.ACTIVE);
            Reservation held = reservation(requester, UUID.randomUUID(), 10, ReservationStatus.HELD);
            UUID stranger = UUID.randomUUID();
            when(walletRepository.findByUserUuid(stranger)).thenReturn(Optional.empty());

            assertThatThrownBy(() -> reservationService.assertOwnedBy(held.getReservationId(), stranger))
                    .isInstanceOfSatisfying(ResponseStatusException.class,
                            error -> assertThat(error.getStatusCode().value()).isEqualTo(403));
        }

        @Test
        void unknownReservationIsNotFound() {
            when(reservationRepository.findById(any())).thenReturn(Optional.empty());

            assertThatThrownBy(() -> reservationService.assertOwnedBy(UUID.randomUUID(), UUID.randomUUID()))
                    .isInstanceOf(ReservationNotFoundException.class);
        }
    }
}
