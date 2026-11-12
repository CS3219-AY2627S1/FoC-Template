package com.campuscouriers.credit.event;

import java.time.Instant;
import java.util.UUID;

public record ErrandExpiredEvent(
        UUID errandId,
        UUID requesterId,
        long creditValue,
        String resultingStatus,
        String failureReason,
        Instant expiredAt
) {
    public static final String TYPE = "errand.expired";
}
