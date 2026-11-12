package com.campuscouriers.credit.exception;

public class InvalidReservationStateException extends RuntimeException {
    public InvalidReservationStateException() {
        super("Invalid reservation state");
    }
}