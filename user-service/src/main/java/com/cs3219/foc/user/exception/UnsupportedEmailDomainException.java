package com.cs3219.foc.user.exception;

public class UnsupportedEmailDomainException extends RuntimeException {
    public UnsupportedEmailDomainException() {
        super("Please use your NUS email address.");
    }
}
