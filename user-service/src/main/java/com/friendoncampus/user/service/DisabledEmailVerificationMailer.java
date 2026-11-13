package com.friendoncampus.user.service;

/** Safe default for local runs; verification codes are never logged or exposed. */
public class DisabledEmailVerificationMailer implements EmailVerificationMailer {
    @Override public void sendVerificationCode(String email, String code) { }
}
