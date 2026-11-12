package com.campuscouriers.notification_service.event;

import java.util.UUID;

public record ErrandEvent(UUID eventId, UUID errandId, UUID requesterId,
                          UUID courierId, long creditValue) {
}
