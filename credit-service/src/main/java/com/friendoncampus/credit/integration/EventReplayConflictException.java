package com.friendoncampus.credit.integration;

import java.util.UUID;

public class EventReplayConflictException extends RuntimeException {

    public EventReplayConflictException(UUID eventId) {
        super("Event " + eventId + " was replayed with different content");
    }
}
