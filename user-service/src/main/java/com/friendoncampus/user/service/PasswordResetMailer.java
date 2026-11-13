package com.friendoncampus.user.service;

public interface PasswordResetMailer {
    void sendPasswordResetCode(String email, String code);
}
