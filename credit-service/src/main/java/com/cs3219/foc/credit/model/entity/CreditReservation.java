package com.cs3219.foc.credit.model.entity;

import jakarta.persistence.*;
import java.time.OffsetDateTime;
import java.util.UUID;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

@Entity
@Table(name = "credit_reservations")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class CreditReservation {
    @Id
    @Column(name = "errand_id")
    private UUID errandId;

    @Column(name = "operation_id")
    private UUID operationId;

    @Column(name = "user_id")
    private UUID userId;

    @Column(name = "amount")
    private long amount;

    @Column(name = "state")
    @Enumerated(EnumType.STRING)
    private ReservationState state;

    @Column(name = "created_at")
    private OffsetDateTime createdAt;

    @Column(name = "courier_id")
    private UUID courierId;

    @Column(name = "settled_at")
    private OffsetDateTime settledAt;
}
