package com.friendoncampus.user.service;
public class EmailVerificationCooldownException extends RuntimeException { private final long retryAfterSeconds; public EmailVerificationCooldownException(long retryAfterSeconds) { this.retryAfterSeconds = retryAfterSeconds; } public long retryAfterSeconds() { return retryAfterSeconds; } }
