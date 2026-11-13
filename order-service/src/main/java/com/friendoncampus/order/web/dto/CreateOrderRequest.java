package com.friendoncampus.order.web.dto;

import java.time.OffsetDateTime;
import java.util.UUID;

import com.friendoncampus.order.service.CreateOrderCommand;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.AssertTrue;
import jakarta.validation.constraints.Future;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.Size;

@Schema(description = "Details used to create an order")
public record CreateOrderRequest(
        @Schema(description = "Short order title", example = "Collect printing", maxLength = 120)
        @NotBlank @Size(max = 120) String title,
        @Schema(description = "Full order description", example = "Pick up my printout from the COM1 print shop", maxLength = 2000)
        @NotBlank @Size(max = 2000) String description,
        @Schema(description = "Supplier-owned pickup location ID", example = "9fd58f13-c8d5-4320-b757-7893d69a4ae0")
        @NotNull UUID pickupLocationId,
        @Schema(description = "Pickup location name, as shown by Supplier Service; stored as a snapshot", example = "COM1 Print Shop", maxLength = 160)
        @NotBlank @Size(max = 160) String pickupLocationName,
        @Schema(description = "Supplier-owned drop-off location ID; must differ from pickup", example = "eb46dc78-e25e-4f07-a7a2-26bff615d170")
        @NotNull UUID dropoffLocationId,
        @Schema(description = "Drop-off location name, as shown by Supplier Service; stored as a snapshot", example = "UTown Residence", maxLength = 160)
        @NotBlank @Size(max = 160) String dropoffLocationName,
        @Schema(description = "Credit reward offered to the courier; must be positive", example = "10", minimum = "1")
        @NotNull @Positive Integer creditReward,
        @Schema(description = "Latest time the item may be picked up; must be in the future", type = "string", format = "date-time", example = "2026-09-25T14:00:00Z")
        @NotNull @Future OffsetDateTime pickupDeadline) {

    public CreateOrderRequest {
        title = trim(title);
        description = trim(description);
        pickupLocationName = trim(pickupLocationName);
        dropoffLocationName = trim(dropoffLocationName);
    }

    @Schema(hidden = true)
    @AssertTrue(message = "pickup and drop-off locations must be different")
    public boolean isLocationsDistinct() {
        // Leave null reporting to @NotNull on the individual fields.
        if (pickupLocationId == null || dropoffLocationId == null) {
            return true;
        }
        return !pickupLocationId.equals(dropoffLocationId);
    }

    public CreateOrderCommand toCommand(UUID requesterId) {
        return new CreateOrderCommand(
                requesterId,
                title,
                description,
                pickupLocationId,
                pickupLocationName,
                dropoffLocationId,
                dropoffLocationName,
                creditReward,
                pickupDeadline);
    }

    private static String trim(String value) {
        return value == null ? null : value.trim();
    }
}
