package com.friendoncampus.credit.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.argThat;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.util.Optional;
import java.util.UUID;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import com.friendoncampus.credit.domain.CreditAccount;
import com.friendoncampus.credit.domain.CreditReservation;
import com.friendoncampus.credit.domain.ReservationStatus;
import com.friendoncampus.credit.repository.CreditAccountRepository;
import com.friendoncampus.credit.repository.CreditLedgerEntryRepository;
import com.friendoncampus.credit.repository.CreditOperationRepository;
import com.friendoncampus.credit.repository.CreditReservationRepository;

@ExtendWith(MockitoExtension.class)
class CreditReservationServiceTest {

    @Mock CreditAccountRepository accounts;
    @Mock CreditReservationRepository reservations;
    @Mock CreditOperationRepository operations;
    @Mock CreditLedgerEntryRepository ledger;

    private CreditReservationService service;
    private UUID requesterId;
    private CreditAccount account;

    @BeforeEach
    void setUp() {
        service = new CreditReservationService(accounts, reservations, operations, ledger);
        requesterId = UUID.randomUUID();
        account = CreditAccount.empty(requesterId);
        account.grantInitialAllocation(10);
        lenient().when(accounts.findByUserIdForUpdate(requesterId)).thenReturn(Optional.of(account));
    }

    @Test
    void reservesCreditsAtomically() {
        CreditReservationService.ReservationResult result = service.reserve(
                UUID.randomUUID(), UUID.randomUUID(), requesterId, 6);

        assertThat(result.availableBalance()).isEqualTo(4);
        assertThat(result.reservedBalance()).isEqualTo(6);
        assertThat(result.status()).isEqualTo(ReservationStatus.ACTIVE);
        verify(reservations).saveAndFlush(any(CreditReservation.class));
        verify(ledger).save(any());
    }

    @Test
    void rejectsReservationWhenFundsAreInsufficientWithoutPersisting() {
        assertThatThrownBy(() -> service.reserve(
                UUID.randomUUID(), UUID.randomUUID(), requesterId, 11))
                .isInstanceOf(InsufficientCreditsException.class);

        assertThat(account.getAvailableBalance()).isEqualTo(10);
        assertThat(account.getReservedBalance()).isZero();
        verify(reservations, never()).save(any());
        verify(ledger, never()).save(any());
    }

    @Test
    void increasesThenDecreasesAnActiveReservation() {
        UUID orderId = UUID.randomUUID();
        CreditReservation reservation = CreditReservation.active(orderId, requesterId, 4);
        account.reserve(4);
        when(reservations.findByOrderIdForUpdate(orderId)).thenReturn(Optional.of(reservation));

        CreditReservationService.ReservationResult increased = service.adjust(UUID.randomUUID(), orderId, 7);
        CreditReservationService.ReservationResult decreased = service.adjust(UUID.randomUUID(), orderId, 3);

        assertThat(increased.amount()).isEqualTo(7);
        assertThat(increased.availableBalance()).isEqualTo(3);
        assertThat(decreased.amount()).isEqualTo(3);
        assertThat(decreased.availableBalance()).isEqualTo(7);
        assertThat(decreased.reservedBalance()).isEqualTo(3);
    }

    @Test
    void releasesTheFullReservation() {
        UUID orderId = UUID.randomUUID();
        CreditReservation reservation = CreditReservation.active(orderId, requesterId, 6);
        account.reserve(6);
        when(reservations.findByOrderIdForUpdate(orderId)).thenReturn(Optional.of(reservation));

        CreditReservationService.ReservationResult result = service.release(UUID.randomUUID(), orderId);

        assertThat(result.status()).isEqualTo(ReservationStatus.RELEASED);
        assertThat(result.availableBalance()).isEqualTo(10);
        assertThat(result.reservedBalance()).isZero();
    }

    @Test
    void pendingCreditTimeoutWithoutReservationIsADurableNoOp() {
        UUID operationId = UUID.randomUUID();
        UUID orderId = UUID.randomUUID();

        assertThat(service.releaseForPendingCreditTimeout(operationId, orderId)).isEmpty();

        verify(operations).saveAndFlush(argThat(operation ->
                operation.getId().equals(operationId)
                        && operation.getOrderId().equals(orderId)
                        && operation.getResultCode().equals("NO_RESERVATION_TO_RELEASE")));
        verify(ledger, never()).save(any());
    }
}
