package com.friendoncampus.credit.service;

import java.nio.charset.StandardCharsets;
import java.util.UUID;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.friendoncampus.credit.domain.CreditAccount;
import com.friendoncampus.credit.domain.CreditLedgerEntry;
import com.friendoncampus.credit.domain.CreditOperation;
import com.friendoncampus.credit.domain.CreditOperationType;
import com.friendoncampus.credit.domain.LedgerEntryType;
import com.friendoncampus.credit.repository.CreditAccountRepository;
import com.friendoncampus.credit.repository.CreditLedgerEntryRepository;
import com.friendoncampus.credit.repository.CreditOperationRepository;

@Service
public class InitialCreditAllocationService {

    public static final int INITIAL_CREDITS = 10;
    private static final String SELF_PROVISION_OPERATION_PREFIX = "credit-account-activation:";

    private final CreditAccountRepository accounts;
    private final CreditOperationRepository operations;
    private final CreditLedgerEntryRepository ledger;

    public InitialCreditAllocationService(
            CreditAccountRepository accounts,
            CreditOperationRepository operations,
            CreditLedgerEntryRepository ledger) {
        this.accounts = accounts;
        this.operations = operations;
        this.ledger = ledger;
    }

    @Transactional
    public AllocationResult allocateForAuthenticatedUser(UUID userId) {
        if (userId == null) {
            throw new IllegalArgumentException("User ID is required");
        }
        UUID operationId = UUID.nameUUIDFromBytes(
                (SELF_PROVISION_OPERATION_PREFIX + userId).getBytes(StandardCharsets.UTF_8));
        return allocate(operationId, userId);
    }

    @Transactional
    public AllocationResult allocate(UUID operationId, UUID userId) {
        if (operationId == null || userId == null) {
            throw new IllegalArgumentException("Operation ID and user ID are required");
        }

        String requestHash = OperationFingerprint.sha256(
                CreditOperationType.INITIAL_ALLOCATION + "|" + userId + "|" + INITIAL_CREDITS);

        CreditOperation previous = operations.findById(operationId).orElse(null);
        if (previous != null) {
            requireSameRequest(previous, requestHash);
            CreditAccount account = accounts.findById(userId)
                    .orElseThrow(() -> new IllegalStateException("Allocated credit account is missing"));
            return result(account, false);
        }

        accounts.insertEmptyIfAbsent(userId);
        CreditAccount account = accounts.findByUserIdForUpdate(userId)
                .orElseThrow(() -> new IllegalStateException("Credit account could not be created"));

        previous = operations.findById(operationId).orElse(null);
        if (previous != null) {
            requireSameRequest(previous, requestHash);
            return result(account, false);
        }

        boolean allocated = account.grantInitialAllocation(INITIAL_CREDITS);
        operations.saveAndFlush(CreditOperation.completed(
                operationId,
                CreditOperationType.INITIAL_ALLOCATION,
                null,
                requestHash,
                allocated ? "ALLOCATED" : "ALREADY_ALLOCATED"));

        if (allocated) {
            accounts.save(account);
            ledger.save(CreditLedgerEntry.record(
                    operationId,
                    userId,
                    null,
                    LedgerEntryType.INITIAL_ALLOCATION,
                    INITIAL_CREDITS,
                    0,
                    account.getAvailableBalance(),
                    account.getReservedBalance()));
        }

        return result(account, allocated);
    }

    private static void requireSameRequest(CreditOperation previous, String requestHash) {
        if (previous.getOperationType() != CreditOperationType.INITIAL_ALLOCATION
                || !previous.getRequestHash().equals(requestHash)) {
            throw new IdempotencyConflictException();
        }
    }

    private static AllocationResult result(CreditAccount account, boolean newlyAllocated) {
        return new AllocationResult(
                account.getUserId(),
                newlyAllocated ? INITIAL_CREDITS : 0,
                account.getAvailableBalance(),
                account.getReservedBalance(),
                newlyAllocated);
    }

    public record AllocationResult(
            UUID userId,
            int allocatedAmount,
            int availableBalance,
            int reservedBalance,
            boolean newlyAllocated) {
    }
}
