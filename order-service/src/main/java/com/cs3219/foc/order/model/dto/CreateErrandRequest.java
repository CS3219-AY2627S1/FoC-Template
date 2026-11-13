package com.cs3219.foc.order.model.dto;

import jakarta.validation.constraints.*;
import java.util.UUID;

public record CreateErrandRequest(
        @NotNull UUID createRequestId,
        @NotNull UUID supplierId,
        @NotBlank @Size(max = 500) String deliveryLocation,
        @NotBlank @Size(max = 2000) String description,
        @Size(max = 2000) String notes,
        @Positive long creditReward,
        @Positive int expiryMinutes) {
    public CreateErrandRequest {
        notes = notes == null ? "" : notes;
    }
}
