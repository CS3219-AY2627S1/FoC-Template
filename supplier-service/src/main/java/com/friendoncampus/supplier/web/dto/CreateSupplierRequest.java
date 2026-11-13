package com.friendoncampus.supplier.web.dto;

import java.time.LocalTime;

import com.friendoncampus.supplier.domain.SupplierStatus;
import com.friendoncampus.supplier.service.CreateSupplierCommand;
import com.friendoncampus.supplier.web.validation.HttpUrl;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

@Schema(description = "Details used to create a supplier")
public record CreateSupplierRequest(
        @Schema(description = "Supplier display name", example = "New Campus Cafe", maxLength = 255)
        @NotBlank @Size(max = 255) String name,
        @Schema(description = "Supplier category", example = "Food/Coffee", maxLength = 100)
        @NotBlank @Size(max = 100) String type,
        @Schema(description = "Campus building", example = "COM3", maxLength = 255)
        @NotBlank @Size(max = 255) String building,
        @Schema(description = "Floor label", example = "1", maxLength = 20, nullable = true)
        @Size(max = 20) String floor,
        @Schema(description = "Directions within or near the building", example = "Beside the main entrance", nullable = true)
        String locationDescription,
        @Schema(description = "Latitude in decimal degrees", example = "1.2948", minimum = "-90", maximum = "90")
        @NotNull @DecimalMin("-90.0") @DecimalMax("90.0") Double latitude,
        @Schema(description = "Longitude in decimal degrees", example = "103.7716", minimum = "-180", maximum = "180")
        @NotNull @DecimalMin("-180.0") @DecimalMax("180.0") Double longitude,
        @Schema(description = "Local opening time; independent of closing time", type = "string", format = "time", example = "08:00", nullable = true)
        LocalTime openingTime,
        @Schema(description = "Local closing time; may be earlier for overnight operation", type = "string", format = "time", example = "18:00", nullable = true)
        LocalTime closingTime,
        @Schema(description = "Absolute HTTP or HTTPS image URL", format = "uri", example = "https://example.com/cafe.jpg", nullable = true)
        @HttpUrl String imageUrl,
        @Schema(description = "Initial status; defaults to ACTIVE when omitted", example = "ACTIVE", allowableValues = {"ACTIVE", "INACTIVE"}, defaultValue = "ACTIVE", nullable = true)
        SupplierStatus status) {

    public CreateSupplierRequest {
        name = trim(name);
        type = trim(type);
        building = trim(building);
        floor = trimToNull(floor);
        locationDescription = trimToNull(locationDescription);
        imageUrl = trimToNull(imageUrl);
        status = status == null ? SupplierStatus.ACTIVE : status;
    }

    public CreateSupplierCommand toCommand() {
        return new CreateSupplierCommand(
                name,
                type,
                building,
                floor,
                locationDescription,
                latitude,
                longitude,
                openingTime,
                closingTime,
                imageUrl,
                status);
    }

    private static String trim(String value) {
        return value == null ? null : value.trim();
    }

    private static String trimToNull(String value) {
        String trimmed = trim(value);
        return trimmed == null || trimmed.isEmpty() ? null : trimmed;
    }
}
