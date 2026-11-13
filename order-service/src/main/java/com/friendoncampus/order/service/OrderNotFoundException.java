package com.friendoncampus.order.service;

import java.util.UUID;

/** The order does not exist, or the caller is not allowed to know that it does. */
public class OrderNotFoundException extends RuntimeException {

    private final UUID orderId;

    public OrderNotFoundException(UUID orderId) {
        super("Order " + orderId + " was not found");
        this.orderId = orderId;
    }

    public UUID getOrderId() {
        return orderId;
    }
}
