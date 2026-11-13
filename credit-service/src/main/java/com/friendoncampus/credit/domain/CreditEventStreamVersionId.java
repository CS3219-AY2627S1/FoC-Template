package com.friendoncampus.credit.domain;

import java.io.Serializable;
import java.util.Objects;
import java.util.UUID;

public class CreditEventStreamVersionId implements Serializable {
    private String aggregateType;
    private UUID aggregateId;

    public CreditEventStreamVersionId() {
    }

    public CreditEventStreamVersionId(String aggregateType, UUID aggregateId) {
        this.aggregateType = aggregateType;
        this.aggregateId = aggregateId;
    }

    @Override
    public boolean equals(Object other) {
        if (this == other) return true;
        if (!(other instanceof CreditEventStreamVersionId that)) return false;
        return Objects.equals(aggregateType, that.aggregateType) && Objects.equals(aggregateId, that.aggregateId);
    }

    @Override
    public int hashCode() {
        return Objects.hash(aggregateType, aggregateId);
    }
}
