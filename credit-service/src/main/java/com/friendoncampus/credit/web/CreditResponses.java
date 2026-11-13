package com.friendoncampus.credit.web;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

import org.springframework.data.domain.Page;

import com.friendoncampus.credit.domain.CreditAccount;
import com.friendoncampus.credit.domain.CreditLedgerEntry;
import com.friendoncampus.credit.domain.LedgerEntryType;

public final class CreditResponses {

    private CreditResponses() {
    }

    public record Balance(
            UUID userId,
            int availableBalance,
            int reservedBalance,
            int totalBalance,
            OffsetDateTime updatedAt) {

        static Balance from(CreditAccount account) {
            return new Balance(
                    account.getUserId(),
                    account.getAvailableBalance(),
                    account.getReservedBalance(),
                    account.getTotalBalance(),
                    account.getUpdatedAt());
        }
    }

    public record Transaction(
            UUID id,
            UUID operationId,
            UUID reservationId,
            LedgerEntryType type,
            int availableDelta,
            int reservedDelta,
            int availableBalanceAfter,
            int reservedBalanceAfter,
            OffsetDateTime createdAt) {

        static Transaction from(CreditLedgerEntry entry) {
            return new Transaction(
                    entry.getId(),
                    entry.getOperationId(),
                    entry.getReservationId(),
                    entry.getEntryType(),
                    entry.getAvailableDelta(),
                    entry.getReservedDelta(),
                    entry.getAvailableBalanceAfter(),
                    entry.getReservedBalanceAfter(),
                    entry.getCreatedAt());
        }
    }

    public record TransactionPage(
            List<Transaction> content,
            int page,
            int size,
            long totalElements,
            int totalPages) {

        static TransactionPage from(Page<CreditLedgerEntry> entries) {
            return new TransactionPage(
                    entries.getContent().stream().map(Transaction::from).toList(),
                    entries.getNumber(),
                    entries.getSize(),
                    entries.getTotalElements(),
                    entries.getTotalPages());
        }
    }
}
