package com.campuscouriers.credit.exception;

public class IllegalUUIDNullException extends RuntimeException {

    public IllegalUUIDNullException() {
        super("userUuid must not be null");
    }
}
