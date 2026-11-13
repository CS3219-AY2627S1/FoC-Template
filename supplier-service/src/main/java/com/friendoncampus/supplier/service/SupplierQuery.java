package com.friendoncampus.supplier.service;

import java.util.Locale;
import java.util.Map;
import java.util.Set;

import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;

public record SupplierQuery(
        String search,
        String type,
        String building,
        int page,
        int size,
        String sortField,
        Sort.Direction sortDirection) {

    public static final int DEFAULT_PAGE = 0;
    public static final int DEFAULT_SIZE = 20;
    public static final int MAX_SIZE = 100;
    public static final String DEFAULT_SORT = "name,asc";

    private static final String PUBLIC_SORT_FIELDS_DESCRIPTION =
            "name, type, building, openingTime, closingTime, createdAt, updatedAt";
    private static final String ADMIN_SORT_FIELDS_DESCRIPTION =
            PUBLIC_SORT_FIELDS_DESCRIPTION + ", status";

    private static final Map<String, String> PUBLIC_SORT_FIELDS = Map.of(
            "name", "name",
            "type", "type",
            "building", "building",
            "openingTime", "openingTime",
            "closingTime", "closingTime",
            "createdAt", "createdAt",
            "updatedAt", "updatedAt");
    private static final Map<String, String> ADMIN_SORT_FIELDS = Map.of(
            "name", "name",
            "type", "type",
            "building", "building",
            "openingTime", "openingTime",
            "closingTime", "closingTime",
            "createdAt", "createdAt",
            "updatedAt", "updatedAt",
            "status", "status");

    private static final Set<String> STRING_SORT_FIELDS = Set.of("name", "type", "building");

    public static SupplierQuery from(
            String search,
            String type,
            String building,
            String page,
            String size,
            String sort) {
        return parse(
                search,
                type,
                building,
                page,
                size,
                sort,
                PUBLIC_SORT_FIELDS,
                PUBLIC_SORT_FIELDS_DESCRIPTION);
    }

    static SupplierQuery fromAdmin(
            String search,
            String type,
            String building,
            String page,
            String size,
            String sort) {
        return parse(
                search,
                type,
                building,
                page,
                size,
                sort,
                ADMIN_SORT_FIELDS,
                ADMIN_SORT_FIELDS_DESCRIPTION);
    }

    private static SupplierQuery parse(
            String search,
            String type,
            String building,
            String page,
            String size,
            String sort,
            Map<String, String> allowedSortFields,
            String allowedSortFieldsDescription) {
        int parsedPage = parseInteger("page", page, DEFAULT_PAGE);
        if (parsedPage < 0) {
            throw new InvalidSupplierQueryException("page must be greater than or equal to 0");
        }

        int parsedSize = parseInteger("size", size, DEFAULT_SIZE);
        if (parsedSize < 1 || parsedSize > MAX_SIZE) {
            throw new InvalidSupplierQueryException("size must be between 1 and " + MAX_SIZE);
        }

        String effectiveSort = sort == null ? DEFAULT_SORT : sort.trim();
        if (effectiveSort.isEmpty()) {
            throw new InvalidSupplierQueryException(
                    "sort must use the format field,asc or field,desc");
        }

        String[] sortParts = effectiveSort.split(",", -1);
        if (sortParts.length != 2) {
            throw new InvalidSupplierQueryException(
                    "sort must use the format field,asc or field,desc");
        }

        String requestedField = sortParts[0].trim();
        String mappedField = allowedSortFields.get(requestedField);
        if (mappedField == null) {
            throw new InvalidSupplierQueryException(
                    "Unsupported sort field '" + requestedField + "'. Allowed fields: "
                            + allowedSortFieldsDescription);
        }

        String directionValue = sortParts[1].trim().toLowerCase(Locale.ROOT);
        Sort.Direction direction = switch (directionValue) {
            case "asc" -> Sort.Direction.ASC;
            case "desc" -> Sort.Direction.DESC;
            default -> throw new InvalidSupplierQueryException(
                    "Unsupported sort direction '" + sortParts[1].trim()
                            + "'. Use asc or desc");
        };

        return new SupplierQuery(
                normalizeOptional(search),
                normalizeOptional(type),
                normalizeOptional(building),
                parsedPage,
                parsedSize,
                mappedField,
                direction);
    }

    public PageRequest toPageRequest() {
        Sort.Order order = new Sort.Order(sortDirection, sortField).nullsLast();
        if (STRING_SORT_FIELDS.contains(sortField)) {
            order = order.ignoreCase();
        }
        return PageRequest.of(page, size, Sort.by(order));
    }

    private static int parseInteger(String parameterName, String value, int defaultValue) {
        if (value == null) {
            return defaultValue;
        }
        if (value.isBlank()) {
            throw new InvalidSupplierQueryException(parameterName + " must be a whole number");
        }

        try {
            return Integer.parseInt(value.trim());
        } catch (NumberFormatException exception) {
            throw new InvalidSupplierQueryException(parameterName + " must be a whole number");
        }
    }

    private static String normalizeOptional(String value) {
        if (value == null || value.isBlank()) {
            return null;
        }
        return value.trim();
    }
}
