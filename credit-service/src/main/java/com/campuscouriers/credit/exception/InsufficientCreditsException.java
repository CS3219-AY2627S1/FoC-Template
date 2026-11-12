package com.campuscouriers.credit.exception;


public class InsufficientCreditsException extends RuntimeException {
    public InsufficientCreditsException(long available, long required) {
        super("User's available balance is insufficient. User only has " + available + 
        " available credits but " + required + " credits are required");
    }
}