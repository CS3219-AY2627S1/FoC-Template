package com.cs3219.foc.order.exception;

public class CreditAccountPendingException extends RuntimeException {
    public CreditAccountPendingException() {
        super("Your credit account is being prepared. Please try again shortly.");
    }
}
