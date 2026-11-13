package com.friendoncampus.supplier.service;

import java.util.Locale;

import com.friendoncampus.supplier.domain.SupplierStatus;

public record AdminSupplierQuery(SupplierQuery supplierQuery, SupplierStatus status) {

    public static AdminSupplierQuery from(
            String search,
            String type,
            String building,
            String status,
            String page,
            String size,
            String sort) {
        return new AdminSupplierQuery(
                SupplierQuery.fromAdmin(search, type, building, page, size, sort),
                parseStatus(status));
    }

    private static SupplierStatus parseStatus(String value) {
        if (value == null || value.isBlank()) {
            return null;
        }

        try {
            return SupplierStatus.valueOf(value.trim().toUpperCase(Locale.ROOT));
        } catch (IllegalArgumentException exception) {
            throw new InvalidSupplierQueryException(
                    "Unsupported status '" + value.trim()
                            + "'. Use ACTIVE or INACTIVE");
        }
    }
}
