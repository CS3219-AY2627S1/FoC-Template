package sg.edu.nus.foc.user.event;

import java.time.Instant;

public record UserCreatedEvent(String eventId, String userId, String email,
        Instant occurredAt, int schemaVersion) {}

