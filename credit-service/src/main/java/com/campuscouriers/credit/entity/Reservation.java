/*
 * AI Assistance Disclosure
 * Tool: Anthropic Claude (model unrecorded), date: 2026-10-20
 * Scope (AI-61): Generated the Reservation entity for the credit service
 * Author review: Code changes were checked and validated
 */

package com.campuscouriers.credit.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.PrePersist;
import jakarta.persistence.PreUpdate;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.Setter;


import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "reservations")
@Getter
public class Reservation {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    @Column(name = "reservation_id", nullable = false, updatable = false)
    private UUID reservationId;

    @Column(name = "wallet_id", nullable = false, updatable = false)
    private UUID walletId;

    @Column(name = "amount", nullable = false)
    private long amount;

    @Setter
    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false, length = 20)
    private ReservationStatus status;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    @Setter
    @Column(name = "order_id", nullable = false, updatable = false, unique = true)
    private UUID orderId;

    @Setter
    @Column(name = "courier_wallet_id")
    private UUID courierWalletId;

    protected Reservation() {
    }

    public Reservation(UUID walletId, UUID orderId,long amount) {
        this.walletId = walletId;
        this.orderId = orderId;
        this.amount = amount;
        this.status = ReservationStatus.HELD;
    }

    public void changeAmount(long newAmount) {
        this.amount = newAmount;
    }

    @PrePersist
    void onCreate() {
        createdAt = Instant.now();
        updatedAt = createdAt;
    }

    @PreUpdate
    void onUpdate() {
        updatedAt = Instant.now();
    }
}