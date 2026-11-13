package com.friendoncampus.credit.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
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
import com.friendoncampus.credit.domain.CreditOperation;
import com.friendoncampus.credit.domain.CreditOperationType;
import com.friendoncampus.credit.repository.CreditAccountRepository;
import com.friendoncampus.credit.repository.CreditLedgerEntryRepository;
import com.friendoncampus.credit.repository.CreditOperationRepository;

@ExtendWith(MockitoExtension.class)
class InitialCreditAllocationServiceTest {

    @Mock CreditAccountRepository accounts;
    @Mock CreditOperationRepository operations;
    @Mock CreditLedgerEntryRepository ledger;

    private InitialCreditAllocationService service;

    @BeforeEach
    void setUp() {
        service = new InitialCreditAllocationService(accounts, operations, ledger);
    }

    @Test
    void allocatesTenCreditsAndWritesLedgerOnce() {
        UUID operationId = UUID.randomUUID();
        UUID userId = UUID.randomUUID();
        CreditAccount account = CreditAccount.empty(userId);
        when(accounts.findByUserIdForUpdate(userId)).thenReturn(Optional.of(account));

        InitialCreditAllocationService.AllocationResult result = service.allocate(operationId, userId);

        assertThat(result.newlyAllocated()).isTrue();
        assertThat(result.allocatedAmount()).isEqualTo(10);
        assertThat(result.availableBalance()).isEqualTo(10);
        assertThat(result.reservedBalance()).isZero();
        verify(accounts).insertEmptyIfAbsent(userId);
        verify(operations).saveAndFlush(any(CreditOperation.class));
        verify(ledger).save(any());
    }

    @Test
    void replayOfSameOperationReturnsBalanceWithoutAnotherLedgerEntry() {
        UUID operationId = UUID.randomUUID();
        UUID userId = UUID.randomUUID();
        CreditAccount account = CreditAccount.empty(userId);
        account.grantInitialAllocation(10);
        String hash = OperationFingerprint.sha256("INITIAL_ALLOCATION|" + userId + "|10");
        when(operations.findById(operationId)).thenReturn(Optional.of(CreditOperation.completed(
                operationId, CreditOperationType.INITIAL_ALLOCATION, null, hash, "ALLOCATED")));
        when(accounts.findById(userId)).thenReturn(Optional.of(account));

        InitialCreditAllocationService.AllocationResult result = service.allocate(operationId, userId);

        assertThat(result.newlyAllocated()).isFalse();
        assertThat(result.availableBalance()).isEqualTo(10);
        verify(accounts, never()).insertEmptyIfAbsent(any());
        verify(ledger, never()).save(any());
    }

    @Test
    void differentOperationForAlreadyAllocatedUserDoesNotAllocateAgain() {
        UUID userId = UUID.randomUUID();
        CreditAccount account = CreditAccount.empty(userId);
        account.grantInitialAllocation(10);
        when(accounts.findByUserIdForUpdate(userId)).thenReturn(Optional.of(account));

        InitialCreditAllocationService.AllocationResult result = service.allocate(UUID.randomUUID(), userId);

        assertThat(result.newlyAllocated()).isFalse();
        assertThat(result.availableBalance()).isEqualTo(10);
        verify(ledger, never()).save(any());
    }

    @Test
    void rejectsOperationIdReusedForDifferentUser() {
        UUID operationId = UUID.randomUUID();
        UUID originalUser = UUID.randomUUID();
        UUID differentUser = UUID.randomUUID();
        String hash = OperationFingerprint.sha256("INITIAL_ALLOCATION|" + originalUser + "|10");
        when(operations.findById(operationId)).thenReturn(Optional.of(CreditOperation.completed(
                operationId, CreditOperationType.INITIAL_ALLOCATION, null, hash, "ALLOCATED")));

        assertThatThrownBy(() -> service.allocate(operationId, differentUser))
                .isInstanceOf(IdempotencyConflictException.class);
    }
}
