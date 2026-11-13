package com.friendoncampus.user.service;

public class AdminAccountNotFoundException extends RuntimeException {
    public AdminAccountNotFoundException() {
        super("Account was not found");
    }
}
