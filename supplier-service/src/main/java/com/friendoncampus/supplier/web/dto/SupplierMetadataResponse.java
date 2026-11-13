package com.friendoncampus.supplier.web.dto;

import java.util.List;

import com.friendoncampus.supplier.service.SupplierMetadata;

import io.swagger.v3.oas.annotations.media.Schema;

@Schema(description = "Supplier filter values for the endpoint's visibility scope")
public record SupplierMetadataResponse(
        @Schema(description = "Distinct supplier categories sorted case-insensitively", example = "[\"Food\", \"Food/Coffee\", \"Printing\", \"Shopping\"]")
        List<String> types,
        @Schema(description = "Distinct supplier buildings sorted case-insensitively", example = "[\"Blk AS8\", \"Central Library\"]")
        List<String> buildings) {

    public SupplierMetadataResponse {
        types = List.copyOf(types);
        buildings = List.copyOf(buildings);
    }

    public static SupplierMetadataResponse from(SupplierMetadata metadata) {
        return new SupplierMetadataResponse(metadata.types(), metadata.buildings());
    }
}
