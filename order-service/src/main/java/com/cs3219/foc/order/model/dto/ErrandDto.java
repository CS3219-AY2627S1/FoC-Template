package com.cs3219.foc.order.model.dto;

import com.cs3219.foc.order.model.entity.CreditState;
import com.cs3219.foc.order.model.entity.ErrandStatus;
import java.time.OffsetDateTime;
import java.util.UUID;

public record ErrandDto(
        UUID id,
        UserBriefDto requester,
        UserBriefDto courier,
        UUID supplierId,
        PickupDto pickup,
        String deliveryLocation,
        String description,
        String notes,
        long creditReward,
        ErrandStatus status,
        CreditState creditState,
        String creationFailureCode,
        OffsetDateTime createdAt,
        OffsetDateTime updatedAt,
        OffsetDateTime expiresAt,
        OffsetDateTime acceptedAt,
        OffsetDateTime pickedUpAt,
        OffsetDateTime endedAt,
        UUID createRequestId,
        OffsetDateTime deliveredAt,
        boolean hasDeliveryPhoto,
        OrderDisputeDto dispute) {
    public record PickupDto(String name, String address) {}
}
