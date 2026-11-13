package com.friendoncampus.user.service;

public interface EmailVerificationMailer {
    void sendVerificationCode(String email, String code);
}
