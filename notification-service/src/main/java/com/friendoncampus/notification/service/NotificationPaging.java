package com.friendoncampus.notification.service;

/**
 * Validated {@code page} / {@code size} list parameters. Values arrive as raw strings so every
 * malformed or out-of-range value is reported as {@code INVALID_QUERY}, as Order and Supplier do.
 */
public record NotificationPaging(int page, int size) {

    public static final int DEFAULT_PAGE = 0;
    public static final int DEFAULT_SIZE = 20;
    public static final int MAX_SIZE = 100;

    public static NotificationPaging from(String page, String size) {
        int parsedPage = parseInteger("page", page, DEFAULT_PAGE);
        if (parsedPage < 0) {
            throw new InvalidNotificationQueryException("page must be greater than or equal to 0");
        }
        int parsedSize = parseInteger("size", size, DEFAULT_SIZE);
        if (parsedSize < 1 || parsedSize > MAX_SIZE) {
            throw new InvalidNotificationQueryException("size must be between 1 and " + MAX_SIZE);
        }
        return new NotificationPaging(parsedPage, parsedSize);
    }

    private static int parseInteger(String parameterName, String value, int defaultValue) {
        if (value == null) {
            return defaultValue;
        }
        if (value.isBlank()) {
            throw new InvalidNotificationQueryException(parameterName + " must be a whole number");
        }
        try {
            return Integer.parseInt(value.trim());
        } catch (NumberFormatException exception) {
            throw new InvalidNotificationQueryException(parameterName + " must be a whole number");
        }
    }
}
