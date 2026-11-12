package com.campuscouriers.credit.exception;

public class IllegalReservedStateException extends RuntimeException {

    public IllegalReservedStateException() {
        super("Reserve balance is lower than the reserved amount");
    }
}
