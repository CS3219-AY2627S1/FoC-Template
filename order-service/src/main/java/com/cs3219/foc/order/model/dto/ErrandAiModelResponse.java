package com.cs3219.foc.order.model.dto;

import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import java.util.List;
import java.util.UUID;

public record ErrandAiModelResponse(
        @NotBlank @Size(max = 2000) String message,
        @NotNull @Valid Draft draft,
        @NotNull @Size(max = 10) List<@NotNull UUID> supplierChoiceIds) {
    public record Draft(
            UUID supplierId,
            @Size(max = 500) String deliveryLocation,
            @Size(max = 2000) String description,
            @Size(max = 2000) String notes,
            @Positive @Max(9007199254740991L) Long creditReward,
            @Positive Integer expiryMinutes) {}
}
