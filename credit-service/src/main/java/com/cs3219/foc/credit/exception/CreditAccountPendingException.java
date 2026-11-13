package com.cs3219.foc.credit.exception;

public class CreditAccountPendingException extends RuntimeException {
    public CreditAccountPendingException() {
        super("Credit account setup is pending. Please try again later.");
    }
}
