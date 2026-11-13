package com.cs3219.foc.credit.model.entity;

import jakarta.persistence.*;
import java.time.OffsetDateTime;
import java.util.UUID;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

@Entity
@Table(name = "credit_transaction_log")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class CreditTransactionLog {
    @Id
    @Column(name = "operation_id")
    private UUID operationId;

    @Column(name = "errand_id")
    private UUID errandId;

    @Column(name = "user_id")
    private UUID userId;

    @Column(name = "courier_id")
    private UUID courierId;

    @Column(name = "amount")
    private long amount;

    @Column(name = "transaction_type")
    private String transactionType;

    @Column(name = "created_at")
    private OffsetDateTime createdAt;
}
