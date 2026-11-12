package com.campuscouriers.notification_service.event;

public class InvalidNotificationEventException extends RuntimeException {
    public InvalidNotificationEventException(String message) {
        super(message);
    }
}
