package com.friendoncampus.notification.service;

/** A list parameter is malformed or out of range; reported as {@code 400 INVALID_QUERY}. */
public class InvalidNotificationQueryException extends RuntimeException {

    public InvalidNotificationQueryException(String message) {
        super(message);
    }
}
