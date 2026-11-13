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
import jakarta.persistence.PreUpdate;
import jakarta.persistence.Table;
import jakarta.persistence.Version;

@Entity
@Table(name = "credit_reservations")
public class CreditReservation {

    @Id
    private UUID id;

    @Column(name = "order_id", nullable = false, unique = true)
    private UUID orderId;

    @Column(name = "requester_id", nullable = false)
    private UUID requesterId;

    @Column(name = "courier_id")
    private UUID courierId;

    @Column(nullable = false)
    private int amount;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 24)
    private ReservationStatus status;

    @Version
    @Column(nullable = false)
    private long version;

    @Column(name = "created_at", nullable = false)
    private OffsetDateTime createdAt;

    @Column(name = "updated_at", nullable = false)
    private OffsetDateTime updatedAt;

    protected CreditReservation() {
    }

    public static CreditReservation active(UUID orderId, UUID requesterId, int amount) {
        CreditReservation reservation = new CreditReservation();
        reservation.id = UUID.randomUUID();
        reservation.orderId = orderId;
        reservation.requesterId = requesterId;
        reservation.amount = amount;
        reservation.status = ReservationStatus.ACTIVE;
        return reservation;
    }

    public void adjustAmount(int newAmount) {
        requireActive();
        if (newAmount <= 0) {
            throw new IllegalArgumentException("Reservation amount must be positive");
        }
        amount = newAmount;
    }

    public void release() {
        requireActive();
        status = ReservationStatus.RELEASED;
    }

    public void settle(UUID courierId) {
        requireActive();
        requireDistinctCourier(courierId);
        this.courierId = courierId;
        status = ReservationStatus.SETTLED;
    }

    public void compensate(UUID courierId) {
        requireActive();
        requireDistinctCourier(courierId);
        this.courierId = courierId;
        status = ReservationStatus.COMPENSATED;
    }

    private void requireDistinctCourier(UUID courierId) {
        if (courierId == null) {
            throw new IllegalArgumentException("Courier identifier is required");
        }
        if (requesterId.equals(courierId)) {
            throw new IllegalArgumentException("Requester and courier must be different users");
        }
    }

    private void requireActive() {
        if (status != ReservationStatus.ACTIVE) {
            throw new IllegalStateException("Reservation is not active");
        }
    }

    @PrePersist
    void prepareForCreate() {
        OffsetDateTime now = OffsetDateTime.now(ZoneOffset.UTC);
        createdAt = now;
        updatedAt = now;
    }

    @PreUpdate
    void prepareForUpdate() {
        updatedAt = OffsetDateTime.now(ZoneOffset.UTC);
    }

    public UUID getId() { return id; }
    public UUID getOrderId() { return orderId; }
    public UUID getRequesterId() { return requesterId; }
    public UUID getCourierId() { return courierId; }
    public int getAmount() { return amount; }
    public ReservationStatus getStatus() { return status; }
    public long getVersion() { return version; }
    public OffsetDateTime getCreatedAt() { return createdAt; }
    public OffsetDateTime getUpdatedAt() { return updatedAt; }
}
