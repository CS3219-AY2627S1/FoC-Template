/*
 * AI Assistance Disclosure
 * Tool: Anthropic Claude (model unrecorded), date: 2026-11-06
 * Scope (AI-62): Generated the CreditRecords entity for the credit service
 * Author review: Code changes were checked and validated
 */

package com.campuscouriers.credit.entity;

import jakarta.persistence.*;
import lombok.Getter;

import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "credit_records",
       indexes = @Index(name = "idx_credit_records_wallet_time", columnList = "wallet_id, occurred_at"))
@Getter
public class CreditRecords {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    @Column(name = "credit_record_id", nullable = false, updatable = false)
    private UUID creditRecordId;

    @Column(name = "wallet_id", nullable = false, updatable = false)
    private UUID walletId;

    @Column(name = "order_id", nullable = false, updatable = false)
    private UUID orderId;

    @Enumerated(EnumType.STRING)
    @Column(name = "type", nullable = false, updatable = false, length = 20)
    private CreditRecordsType type;

    @Column(name = "available_delta", nullable = false, updatable = false)
    private long availableDelta;      // signed change to available balance

    @Column(name = "reserve_delta", nullable = false, updatable = false)
    private long reserveDelta;        // signed change to reserved balance

    @Column(name = "available_balance_after", nullable = false, updatable = false)
    private long availableBalanceAfter;

    @Column(name = "reserve_balance_after", nullable = false, updatable = false)
    private long reserveBalanceAfter;

    @Column(name = "counterparty_wallet_id", updatable = false)
    private UUID counterpartyWalletId; // courier for TRANSFERRED, requester for RECEIVED

    @Column(name = "occurred_at", nullable = false, updatable = false)
    private Instant occurredAt;

    protected CreditRecords() {
    }

    public CreditRecords(UUID walletId, UUID orderId, CreditRecordsType type,
                         long availableDelta, long reserveDelta,
                         long availableBalanceAfter, long reserveBalanceAfter,
                         UUID counterpartyWalletId) {
        this.walletId = walletId;
        this.orderId = orderId;
        this.type = type;
        this.availableDelta = availableDelta;
        this.reserveDelta = reserveDelta;
        this.availableBalanceAfter = availableBalanceAfter;
        this.reserveBalanceAfter = reserveBalanceAfter;
        this.counterpartyWalletId = counterpartyWalletId;
        this.occurredAt = Instant.now();
    }
}