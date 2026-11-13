package com.friendoncampus.user.service;

public class InvalidPasswordResetCodeException extends RuntimeException {
    public InvalidPasswordResetCodeException() {
        super("Invalid or expired password reset code");
    }
}
