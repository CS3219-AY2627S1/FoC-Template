package com.friendoncampus.order.domain;

import java.time.OffsetDateTime;
import java.util.UUID;

/**
 * The requester-editable fields of an order, as sent in a full-replace edit. Field rules (lengths,
 * distinct locations, positive reward, future deadline) are validated at the API boundary.
 */
public record OrderDetails(
        String title,
        String description,
        UUID pickupLocationId,
        String pickupLocationName,
        UUID dropoffLocationId,
        String dropoffLocationName,
        int creditReward,
        OffsetDateTime pickupDeadline) {
}
