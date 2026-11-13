package com.friendoncampus.order.web.dto;

import java.util.List;

import org.springframework.data.domain.Page;

import com.friendoncampus.order.domain.Order;

import io.swagger.v3.oas.annotations.media.Schema;

/** A page of orders. Field names match Supplier Service's list response. */
@Schema(description = "Page of orders and pagination metadata")
public record OrderPageResponse(
        @Schema(description = "Orders in the requested page")
        List<OrderResponse> items,
        @Schema(description = "Zero-based page number", example = "0", minimum = "0")
        int page,
        @Schema(description = "Requested page size", example = "20", minimum = "1", maximum = "50")
        int size,
        @Schema(description = "Number of orders matching the query", example = "21", minimum = "0")
        long totalItems,
        @Schema(description = "Number of available pages", example = "2", minimum = "0")
        int totalPages) {

    public OrderPageResponse {
        items = List.copyOf(items);
    }

    public static OrderPageResponse from(Page<Order> orders) {
        return new OrderPageResponse(
                orders.getContent().stream().map(OrderResponse::from).toList(),
                orders.getNumber(),
                orders.getSize(),
                orders.getTotalElements(),
                orders.getTotalPages());
    }
}
