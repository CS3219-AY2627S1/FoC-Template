package com.friendoncampus.user.service;

public class AdminLifecycleException extends RuntimeException {
    private final String code;
    public AdminLifecycleException(String message) {
        this(message, "INVALID_ACCOUNT_STATE");
    }
    public AdminLifecycleException(String message, String code) { super(message); this.code = code; }
    public String code() { return code; }
}
