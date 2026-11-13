package com.cs3219.foc.order.exception;

import java.util.UUID;

public class OrderCreationAttemptException extends RuntimeException {
    private final UUID errandId;

    public OrderCreationAttemptException(UUID errandId, RuntimeException cause) {
        super("Creation attempt failed for order " + errandId, cause);
        this.errandId = errandId;
    }

    public UUID getErrandId() {
        return errandId;
    }
}
