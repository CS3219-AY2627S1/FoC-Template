package com.friendoncampus.supplier.web.dto;

import java.util.List;

import org.springframework.data.domain.Page;

import com.friendoncampus.supplier.domain.Supplier;

import io.swagger.v3.oas.annotations.media.Schema;

@Schema(description = "Page of suppliers and pagination metadata")
public record SupplierListResponse(
        @Schema(description = "Suppliers in the requested page")
        List<SupplierResponse> items,
        @Schema(description = "Zero-based page number", example = "0", minimum = "0")
        int page,
        @Schema(description = "Requested page size", example = "20", minimum = "1", maximum = "100")
        int size,
        @Schema(description = "Number of suppliers matching the query", example = "21", minimum = "0")
        long totalItems,
        @Schema(description = "Number of available pages", example = "2", minimum = "0")
        int totalPages) {

    public SupplierListResponse {
        items = List.copyOf(items);
    }

    public static SupplierListResponse from(Page<Supplier> suppliers) {
        return new SupplierListResponse(
                suppliers.getContent().stream()
                        .map(SupplierResponse::from)
                        .toList(),
                suppliers.getNumber(),
                suppliers.getSize(),
                suppliers.getTotalElements(),
                suppliers.getTotalPages());
    }
}
