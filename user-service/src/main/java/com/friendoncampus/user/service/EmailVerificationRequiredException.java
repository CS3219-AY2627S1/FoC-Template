package com.friendoncampus.user.service;

/** Returned only after the supplied password matches an unverified account. */
public class EmailVerificationRequiredException extends RuntimeException {
    public EmailVerificationRequiredException() {
        super("Email verification is required before signing in");
    }
}
