package com.campuscouriers.credit.exception;

public class MisconfiguredCreditsException extends RuntimeException {

    public MisconfiguredCreditsException(String message) {
        super("Default credits misconfigured: " + message);
    }
}
