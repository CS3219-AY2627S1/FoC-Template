package com.campuscouriers.credit.exception;

import java.util.UUID;

public class DuplicateReservationException extends RuntimeException {
    public DuplicateReservationException(UUID orderId) {
        super("Order " + orderId + " already has a reservation with different details");
    }
}