package com.friendoncampus.user.service;

public class PasswordReuseException extends RuntimeException {
    public PasswordReuseException() {
        super("New password must be different from your current password");
    }
}
