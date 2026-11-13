package com.friendoncampus.credit.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
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
import com.friendoncampus.credit.domain.CreditOperation;
import com.friendoncampus.credit.domain.CreditOperationType;
import com.friendoncampus.credit.domain.CreditReservation;
import com.friendoncampus.credit.domain.ReservationStatus;
import com.friendoncampus.credit.repository.CreditAccountRepository;
import com.friendoncampus.credit.repository.CreditLedgerEntryRepository;
import com.friendoncampus.credit.repository.CreditOperationRepository;
import com.friendoncampus.credit.repository.CreditReservationRepository;

@ExtendWith(MockitoExtension.class)
class CreditSettlementServiceTest {

    @Mock CreditAccountRepository accounts;
    @Mock CreditReservationRepository reservations;
    @Mock CreditOperationRepository operations;
    @Mock CreditLedgerEntryRepository ledger;

    private CreditSettlementService service;
    private UUID orderId;
    private UUID requesterId;
    private UUID courierId;
    private CreditAccount requester;
    private CreditAccount courier;
    private CreditReservation reservation;

    @BeforeEach
    void setUp() {
        service = new CreditSettlementService(accounts, reservations, operations, ledger);
        orderId = UUID.randomUUID();
        requesterId = UUID.fromString("10000000-0000-0000-0000-000000000000");
        courierId = UUID.fromString("20000000-0000-0000-0000-000000000000");
        requester = fundedAccount(requesterId);
        courier = fundedAccount(courierId);
        reservation = CreditReservation.active(orderId, requesterId, 6);
        requester.reserve(6);
    }

    @Test
    void completionTransfersTheFullReservation() {
        stubSettlementState();
        CreditSettlementService.SettlementResult result =
                service.settle(UUID.randomUUID(), orderId, courierId);

        assertThat(result.status()).isEqualTo(ReservationStatus.SETTLED);
        assertThat(result.transferredAmount()).isEqualTo(6);
        assertThat(result.releasedAmount()).isZero();
        assertThat(result.requesterAvailableBalance()).isEqualTo(4);
        assertThat(result.requesterReservedBalance()).isZero();
        assertThat(result.courierAvailableBalance()).isEqualTo(16);
        assertThat(total(result)).isEqualTo(20);
        verify(ledger, times(2)).save(any());
    }

    @Test
    void compensationRoundsTwentyPercentUpAndReleasesTheRemainder() {
        stubSettlementState();
        CreditSettlementService.SettlementResult result =
                service.compensate(UUID.randomUUID(), orderId, courierId);

        assertThat(result.status()).isEqualTo(ReservationStatus.COMPENSATED);
        assertThat(result.transferredAmount()).isEqualTo(2);
        assertThat(result.releasedAmount()).isEqualTo(4);
        assertThat(result.requesterAvailableBalance()).isEqualTo(8);
        assertThat(result.requesterReservedBalance()).isZero();
        assertThat(result.courierAvailableBalance()).isEqualTo(12);
        assertThat(total(result)).isEqualTo(20);
    }

    @Test
    void settledReservationCannotBeCompensatedAgain() {
        stubSettlementState();
        service.settle(UUID.randomUUID(), orderId, courierId);

        assertThatThrownBy(() -> service.compensate(UUID.randomUUID(), orderId, courierId))
                .isInstanceOf(InvalidReservationStateException.class);
        verify(ledger, times(2)).save(any());
    }

    @Test
    void replayedOperationReturnsPersistedOutcomeWithoutAnotherTransfer() {
        stubSettlementState();
        UUID operationId = UUID.randomUUID();
        service.settle(operationId, orderId, courierId);
        String hash = OperationFingerprint.sha256("SETTLE|" + orderId + "|" + courierId);
        when(operations.findById(operationId)).thenReturn(Optional.of(CreditOperation.completed(
                operationId, CreditOperationType.SETTLE, orderId, hash, "SETTLED")));
        when(reservations.findByOrderId(orderId)).thenReturn(Optional.of(reservation));
        when(accounts.findById(requesterId)).thenReturn(Optional.of(requester));
        when(accounts.findById(courierId)).thenReturn(Optional.of(courier));

        CreditSettlementService.SettlementResult replay = service.settle(operationId, orderId, courierId);

        assertThat(replay.changed()).isFalse();
        assertThat(replay.courierAvailableBalance()).isEqualTo(16);
        verify(operations, times(1)).saveAndFlush(any());
        verify(ledger, times(2)).save(any());
    }

    @Test
    void requesterCannotAlsoBeCourier() {
        when(reservations.findByOrderIdForUpdate(orderId)).thenReturn(Optional.of(reservation));
        assertThatThrownBy(() -> service.settle(UUID.randomUUID(), orderId, requesterId))
                .isInstanceOf(IllegalArgumentException.class);
        verify(operations, never()).saveAndFlush(any());
        verify(ledger, never()).save(any());
    }

    @Test
    void compensationFormulaAlwaysRoundsUp() {
        assertThat(CreditSettlementService.compensationFor(1)).isEqualTo(1);
        assertThat(CreditSettlementService.compensationFor(5)).isEqualTo(1);
        assertThat(CreditSettlementService.compensationFor(6)).isEqualTo(2);
        assertThat(CreditSettlementService.compensationFor(10)).isEqualTo(2);
    }

    private static CreditAccount fundedAccount(UUID userId) {
        CreditAccount account = CreditAccount.empty(userId);
        account.grantInitialAllocation(10);
        return account;
    }

    private void stubSettlementState() {
        when(reservations.findByOrderIdForUpdate(orderId)).thenReturn(Optional.of(reservation));
        when(accounts.findByUserIdForUpdate(requesterId)).thenReturn(Optional.of(requester));
        when(accounts.findByUserIdForUpdate(courierId)).thenReturn(Optional.of(courier));
    }

    private static int total(CreditSettlementService.SettlementResult result) {
        return result.requesterAvailableBalance()
                + result.requesterReservedBalance()
                + result.courierAvailableBalance()
                + result.courierReservedBalance();
    }
}
