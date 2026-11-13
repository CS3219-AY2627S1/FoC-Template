package com.cs3219.foc.order.model.entity;

import jakarta.persistence.*;
import java.time.OffsetDateTime;
import java.util.UUID;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

@Entity
@Table(name = "order_disputes")
@Getter
@Setter
@NoArgsConstructor
public class OrderDispute {
    @Id
    private UUID id;

    @Column(name = "order_id", nullable = false, unique = true)
    private UUID orderId;

    @Column(name = "reporter_id", nullable = false)
    private UUID reporterId;

    @Column(nullable = false, length = 2000)
    private String complaint;

    @Column(name = "responder_id")
    private UUID responderId;

    @Column(length = 2000)
    private String response;

    @Column(name = "responded_at")
    private OffsetDateTime respondedAt;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 24)
    private DisputeStatus status;

    @Enumerated(EnumType.STRING)
    @Column(length = 24)
    private DisputeDecision decision;

    @Column(length = 2000)
    private String explanation;

    @Column(name = "admin_id")
    private UUID adminId;

    @Column(name = "created_at", nullable = false)
    private OffsetDateTime createdAt;

    @Column(name = "decided_at")
    private OffsetDateTime decidedAt;

    @Column(name = "resolved_at")
    private OffsetDateTime resolvedAt;

    @Column(name = "settlement_operation_id")
    private UUID settlementOperationId;

    @Column(name = "settlement_outcome", length = 64)
    private String settlementOutcome;
}
