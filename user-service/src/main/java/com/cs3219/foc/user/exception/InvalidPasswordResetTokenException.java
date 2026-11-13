package com.cs3219.foc.user.exception;

public class InvalidPasswordResetTokenException extends RuntimeException {
    public InvalidPasswordResetTokenException() {
        super("This password reset link is no longer valid.");
    }
}
