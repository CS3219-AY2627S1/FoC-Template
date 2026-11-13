package com.friendoncampus.order.service;

/**
 * Validated {@code page} / {@code size} list parameters. Values arrive as raw strings so every
 * malformed or out-of-range value is reported as {@code INVALID_QUERY}, as Supplier Service does.
 */
public record OrderPaging(int page, int size) {

    public static final int DEFAULT_PAGE = 0;
    public static final int DEFAULT_SIZE = 20;
    public static final int MAX_SIZE = 50;

    public static OrderPaging from(String page, String size) {
        int parsedPage = parseInteger("page", page, DEFAULT_PAGE);
        if (parsedPage < 0) {
            throw new InvalidOrderQueryException("page must be greater than or equal to 0");
        }
        int parsedSize = parseInteger("size", size, DEFAULT_SIZE);
        if (parsedSize < 1 || parsedSize > MAX_SIZE) {
            throw new InvalidOrderQueryException("size must be between 1 and " + MAX_SIZE);
        }
        return new OrderPaging(parsedPage, parsedSize);
    }

    static int parseInteger(String parameterName, String value, int defaultValue) {
        if (value == null) {
            return defaultValue;
        }
        if (value.isBlank()) {
            throw new InvalidOrderQueryException(parameterName + " must be a whole number");
        }
        try {
            return Integer.parseInt(value.trim());
        } catch (NumberFormatException exception) {
            throw new InvalidOrderQueryException(parameterName + " must be a whole number");
        }
    }
}
