package com.cs3219.foc.user.exception;

public class EmailRateLimitException extends RuntimeException {
    public EmailRateLimitException() {
        super("Please wait a minute before requesting another email.");
    }
}
