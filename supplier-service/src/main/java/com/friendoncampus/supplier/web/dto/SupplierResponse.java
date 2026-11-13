package com.friendoncampus.supplier.web.dto;

import java.time.LocalTime;
import java.time.OffsetDateTime;
import java.util.UUID;

import com.friendoncampus.supplier.domain.Supplier;
import com.friendoncampus.supplier.domain.SupplierStatus;

import io.swagger.v3.oas.annotations.media.Schema;

@Schema(description = "Complete supplier representation")
public record SupplierResponse(
        @Schema(description = "Server-generated supplier identifier", format = "uuid", example = "ca9bd61f-93da-4500-9e9d-48de1bea52fa", accessMode = Schema.AccessMode.READ_ONLY)
        UUID id,
        @Schema(description = "Supplier display name", example = "Anna's x Soup Union", maxLength = 255)
        String name,
        @Schema(description = "Supplier category", example = "Food", maxLength = 100)
        String type,
        @Schema(description = "Campus building", example = "Central Library", maxLength = 255)
        String building,
        @Schema(description = "Floor label", example = "1", maxLength = 20, nullable = true)
        String floor,
        @Schema(description = "Directions within or near the building", example = "Next to NUS Co-op", nullable = true)
        String locationDescription,
        @Schema(description = "Latitude in decimal degrees", example = "1.296444", minimum = "-90", maximum = "90")
        double latitude,
        @Schema(description = "Longitude in decimal degrees", example = "103.773032", minimum = "-180", maximum = "180")
        double longitude,
        @Schema(description = "Local opening time", type = "string", format = "time", example = "09:00", nullable = true)
        LocalTime openingTime,
        @Schema(description = "Local closing time", type = "string", format = "time", example = "18:00", nullable = true)
        LocalTime closingTime,
        @Schema(description = "External HTTP(S) image URL or Supplier API path for an uploaded image", nullable = true)
        String imageUrl,
        @Schema(description = "Image origin. UPLOAD is served by Supplier Service from private object storage.", allowableValues = {"EXTERNAL_URL", "UPLOAD"}, nullable = true)
        SupplierImageSource imageSource,
        @Schema(description = "Current visibility status", example = "ACTIVE", allowableValues = {"ACTIVE", "INACTIVE"})
        SupplierStatus status,
        @Schema(description = "Optimistic-lock version", format = "int64", example = "0", minimum = "0", accessMode = Schema.AccessMode.READ_ONLY)
        long version,
        @Schema(description = "Creation timestamp in UTC", type = "string", format = "date-time", example = "2026-09-23T00:00:00Z", accessMode = Schema.AccessMode.READ_ONLY)
        OffsetDateTime createdAt,
        @Schema(description = "Last-change timestamp in UTC", type = "string", format = "date-time", example = "2026-09-23T00:00:00Z", accessMode = Schema.AccessMode.READ_ONLY)
        OffsetDateTime updatedAt) {

    public static SupplierResponse from(Supplier supplier) {
        return new SupplierResponse(
                supplier.getId(),
                supplier.getName(),
                supplier.getType(),
                supplier.getBuilding(),
                supplier.getFloor(),
                supplier.getLocationDescription(),
                supplier.getLatitude(),
                supplier.getLongitude(),
                supplier.getOpeningTime(),
                supplier.getClosingTime(),
                resolvedImageUrl(supplier),
                imageSource(supplier),
                supplier.getStatus(),
                supplier.getVersion(),
                supplier.getCreatedAt(),
                supplier.getUpdatedAt());
    }

    private static String resolvedImageUrl(Supplier supplier) {
        if (supplier.hasUploadedImage()) {
            return "/api/suppliers/" + supplier.getId() + "/image?v=" + supplier.getVersion();
        }
        return supplier.getImageUrl();
    }

    private static SupplierImageSource imageSource(Supplier supplier) {
        if (supplier.hasUploadedImage()) {
            return SupplierImageSource.UPLOAD;
        }
        return supplier.getImageUrl() == null ? null : SupplierImageSource.EXTERNAL_URL;
    }
}
