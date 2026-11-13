package com.cs3219.foc.order.model.entity;

import jakarta.persistence.*;
import java.time.OffsetDateTime;
import java.util.UUID;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

@Entity
@Table(name = "errands")
@Getter
@Setter
@NoArgsConstructor
public class Errand {
    @Id
    @Column(name = "id")
    private UUID id;

    @Column(name = "requester_id", nullable = false)
    private UUID requesterId;

    @Column(name = "courier_id")
    private UUID courierId;

    @Column(name = "supplier_id", nullable = false)
    private UUID supplierId;

    @Column(name = "pickup_name", nullable = false, length = 255)
    private String pickupName;

    @Column(name = "pickup_address", nullable = false, length = 1000)
    private String pickupAddress;

    @Column(name = "delivery_location", nullable = false, length = 500)
    private String deliveryLocation;

    @Column(nullable = false, length = 2000)
    private String description;

    @Column(nullable = false, length = 2000)
    private String notes;

    @Column(name = "credit_reward", nullable = false)
    private long creditReward;

    @Column(name = "create_request_id", nullable = false)
    private UUID createRequestId;

    @Column(name = "settlement_event_id")
    private UUID settlementEventId;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 24)
    private ErrandStatus status;

    @Enumerated(EnumType.STRING)
    @Column(name = "credit_state", length = 24)
    private CreditState creditState;

    @Column(name = "creation_failure_code", length = 64)
    private String creationFailureCode;

    @Column(name = "created_at", nullable = false)
    private OffsetDateTime createdAt;

    @Column(name = "updated_at", nullable = false)
    private OffsetDateTime updatedAt;

    @Column(name = "expires_at", nullable = false)
    private OffsetDateTime expiresAt;

    @Column(name = "accepted_at")
    private OffsetDateTime acceptedAt;

    @Column(name = "picked_up_at")
    private OffsetDateTime pickedUpAt;

    @Column(name = "ended_at")
    private OffsetDateTime endedAt;

    @Column(name = "delivered_at")
    private OffsetDateTime deliveredAt;
}
