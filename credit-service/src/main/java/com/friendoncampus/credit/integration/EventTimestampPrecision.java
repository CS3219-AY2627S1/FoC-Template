package com.friendoncampus.credit.integration;

import java.time.OffsetDateTime;
import java.time.temporal.ChronoUnit;

final class EventTimestampPrecision {

    private EventTimestampPrecision() {
    }

    static OffsetDateTime forPostgres(OffsetDateTime timestamp) {
        return timestamp.truncatedTo(ChronoUnit.MICROS);
    }
}
