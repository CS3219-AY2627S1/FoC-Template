package com.friendoncampus.user.service;

/** Raised when an authenticated account cannot select a requested session role. */
public class RoleSessionAccessDeniedException extends RuntimeException {
    public RoleSessionAccessDeniedException(String message) {
        super(message);
    }
}
