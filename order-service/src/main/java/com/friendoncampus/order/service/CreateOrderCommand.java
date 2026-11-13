package com.friendoncampus.order.service;

import java.time.OffsetDateTime;
import java.util.UUID;

/**
 * Validated inputs for creating an order. {@code requesterId} originates from
 * the authenticated caller (currently the {@code X-User-Id} header).
 */
public record CreateOrderCommand(
        UUID requesterId,
        String title,
        String description,
        UUID pickupLocationId,
        String pickupLocationName,
        UUID dropoffLocationId,
        String dropoffLocationName,
        int creditReward,
        OffsetDateTime pickupDeadline) {
}
