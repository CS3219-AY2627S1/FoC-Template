package com.cs3219.foc.order.model.dto;

import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import java.util.UUID;

public record ErrandDraftDto(
        @Valid Pickup pickup,
        @Size(max = 500) String deliveryLocation,
        @Size(max = 2000) String description,
        @Size(max = 2000) String notes,
        @Positive @Max(9007199254740991L) Long creditReward,
        @Positive Integer expiryMinutes) {
    public record Pickup(
            @NotNull UUID id,
            @NotBlank @Size(max = 500) String name,
            @NotBlank @Size(max = 2000) String address) {}
}
