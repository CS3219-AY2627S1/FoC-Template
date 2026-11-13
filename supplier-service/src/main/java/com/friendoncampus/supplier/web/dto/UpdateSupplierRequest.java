package com.friendoncampus.supplier.web.dto;

import java.time.LocalTime;

import com.friendoncampus.supplier.service.UpdateSupplierCommand;
import com.friendoncampus.supplier.web.validation.HttpUrl;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.PositiveOrZero;
import jakarta.validation.constraints.Size;

@Schema(description = "Complete replacement for a supplier's editable details")
public record UpdateSupplierRequest(
        @Schema(description = "Supplier display name", example = "Updated Campus Cafe", maxLength = 255)
        @NotBlank @Size(max = 255) String name,
        @Schema(description = "Supplier category", example = "Food/Coffee", maxLength = 100)
        @NotBlank @Size(max = 100) String type,
        @Schema(description = "Campus building", example = "COM3", maxLength = 255)
        @NotBlank @Size(max = 255) String building,
        @Schema(description = "Floor label; omitted or blank clears the value", example = "2", maxLength = 20, nullable = true)
        @Size(max = 20) String floor,
        @Schema(description = "Directions; omitted or blank clears the value", example = "Now beside the lift", nullable = true)
        String locationDescription,
        @Schema(description = "Latitude in decimal degrees", example = "1.2948", minimum = "-90", maximum = "90")
        @NotNull @DecimalMin("-90.0") @DecimalMax("90.0") Double latitude,
        @Schema(description = "Longitude in decimal degrees", example = "103.7716", minimum = "-180", maximum = "180")
        @NotNull @DecimalMin("-180.0") @DecimalMax("180.0") Double longitude,
        @Schema(description = "Local opening time; omitted clears the value", type = "string", format = "time", example = "09:00", nullable = true)
        LocalTime openingTime,
        @Schema(description = "Local closing time; overnight operation is valid", type = "string", format = "time", example = "20:00", nullable = true)
        LocalTime closingTime,
        @Schema(description = "Absolute HTTP or HTTPS image URL; omitted or blank clears the value", format = "uri", example = "https://example.com/updated-cafe.jpg", nullable = true)
        @HttpUrl String imageUrl,
        @Schema(description = "Version from the latest supplier response", format = "int64", example = "0", minimum = "0")
        @NotNull @PositiveOrZero Long version) {

    public UpdateSupplierRequest {
        name = trim(name);
        type = trim(type);
        building = trim(building);
        floor = trimToNull(floor);
        locationDescription = trimToNull(locationDescription);
        imageUrl = trimToNull(imageUrl);
    }

    public UpdateSupplierCommand toCommand() {
        return new UpdateSupplierCommand(
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
                version);
    }

    private static String trim(String value) {
        return value == null ? null : value.trim();
    }

    private static String trimToNull(String value) {
        String trimmed = trim(value);
        return trimmed == null || trimmed.isEmpty() ? null : trimmed;
    }
}
