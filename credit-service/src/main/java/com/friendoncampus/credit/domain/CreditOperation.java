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
@Table(name = "credit_operations")
public class CreditOperation {

    @Id
    private UUID id;

    @Enumerated(EnumType.STRING)
    @Column(name = "operation_type", nullable = false, length = 32)
    private CreditOperationType operationType;

    @Column(name = "order_id")
    private UUID orderId;

    @Column(name = "request_hash", nullable = false, length = 64)
    private String requestHash;

    @Column(name = "result_code", nullable = false, length = 48)
    private String resultCode;

    @Column(name = "created_at", nullable = false)
    private OffsetDateTime createdAt;

    protected CreditOperation() {
    }

    public static CreditOperation completed(
            UUID id,
            CreditOperationType operationType,
            UUID orderId,
            String requestHash,
            String resultCode) {
        CreditOperation operation = new CreditOperation();
        operation.id = id;
        operation.operationType = operationType;
        operation.orderId = orderId;
        operation.requestHash = requestHash;
        operation.resultCode = resultCode;
        return operation;
    }

    @PrePersist
    void prepareForCreate() {
        createdAt = OffsetDateTime.now(ZoneOffset.UTC);
    }

    public UUID getId() { return id; }
    public CreditOperationType getOperationType() { return operationType; }
    public UUID getOrderId() { return orderId; }
    public String getRequestHash() { return requestHash; }
    public String getResultCode() { return resultCode; }
    public OffsetDateTime getCreatedAt() { return createdAt; }
}
