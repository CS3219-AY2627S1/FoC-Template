package com.friendoncampus.credit.domain;

import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.UUID;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.PrePersist;
import jakarta.persistence.Table;

@Entity
@Table(name = "credit_ledger_entries")
public class CreditLedgerEntry {

    @Id
    private UUID id;

    @Column(name = "operation_id", nullable = false)
    private UUID operationId;

    @Column(name = "account_id", nullable = false)
    private UUID accountId;

    @Column(name = "reservation_id")
    private UUID reservationId;

    @Enumerated(EnumType.STRING)
    @Column(name = "entry_type", nullable = false, length = 40)
    private LedgerEntryType entryType;

    @Column(name = "available_delta", nullable = false)
    private int availableDelta;

    @Column(name = "reserved_delta", nullable = false)
    private int reservedDelta;

    @Column(name = "available_balance_after", nullable = false)
    private int availableBalanceAfter;

    @Column(name = "reserved_balance_after", nullable = false)
    private int reservedBalanceAfter;

    @Column(name = "created_at", nullable = false)
    private OffsetDateTime createdAt;

    protected CreditLedgerEntry() {
    }

    public static CreditLedgerEntry record(
            UUID operationId,
            UUID accountId,
            UUID reservationId,
            LedgerEntryType entryType,
            int availableDelta,
            int reservedDelta,
            int availableBalanceAfter,
            int reservedBalanceAfter) {
        CreditLedgerEntry entry = new CreditLedgerEntry();
        entry.id = UUID.randomUUID();
        entry.operationId = operationId;
        entry.accountId = accountId;
        entry.reservationId = reservationId;
        entry.entryType = entryType;
        entry.availableDelta = availableDelta;
        entry.reservedDelta = reservedDelta;
        entry.availableBalanceAfter = availableBalanceAfter;
        entry.reservedBalanceAfter = reservedBalanceAfter;
        return entry;
    }

    @PrePersist
    void prepareForCreate() {
        createdAt = OffsetDateTime.now(ZoneOffset.UTC);
    }

    public UUID getId() { return id; }
    public UUID getOperationId() { return operationId; }
    public UUID getAccountId() { return accountId; }
    public UUID getReservationId() { return reservationId; }
    public LedgerEntryType getEntryType() { return entryType; }
    public int getAvailableDelta() { return availableDelta; }
    public int getReservedDelta() { return reservedDelta; }
    public int getAvailableBalanceAfter() { return availableBalanceAfter; }
    public int getReservedBalanceAfter() { return reservedBalanceAfter; }
    public OffsetDateTime getCreatedAt() { return createdAt; }
}
