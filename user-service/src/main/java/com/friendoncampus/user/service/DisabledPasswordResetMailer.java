package com.friendoncampus.user.service;

/**
 * Safe default for local runs where no mail provider has been configured. It deliberately does
 * not log or expose reset codes.
 */
public class DisabledPasswordResetMailer implements PasswordResetMailer {
    @Override
    public void sendPasswordResetCode(String email, String code) {
        // Intentionally blank: no credentials or OTPs are logged in an unconfigured environment.
    }
}
