package com.friendoncampus.order.service;

import java.util.UUID;

/**
 * Validated open-order pool query (F4.2, F4.3). Absent or blank filters are ignored, so a client
 * that keeps its filter form (F4.4) may send empty values.
 */
public record OrderPoolQuery(
        Integer minReward,
        Integer maxReward,
        UUID pickupLocationId,
        UUID dropoffLocationId,
        OrderPoolSort sort,
        OrderPaging paging) {

    public static OrderPoolQuery from(
            String minReward,
            String maxReward,
            String pickupLocationId,
            String dropoffLocationId,
            String sort,
            String page,
            String size) {
        Integer min = parseReward("minReward", minReward);
        Integer max = parseReward("maxReward", maxReward);
        if (min != null && max != null && min > max) {
            throw new InvalidOrderQueryException("minReward must be less than or equal to maxReward");
        }
        return new OrderPoolQuery(
                min,
                max,
                parseUuid("pickupLocationId", pickupLocationId),
                parseUuid("dropoffLocationId", dropoffLocationId),
                OrderPoolSort.from(sort),
                OrderPaging.from(page, size));
    }

    private static Integer parseReward(String parameterName, String value) {
        if (value == null || value.isBlank()) {
            return null;
        }
        int reward = OrderPaging.parseInteger(parameterName, value, 0);
        if (reward < 1) {
            throw new InvalidOrderQueryException(parameterName + " must be a positive whole number");
        }
        return reward;
    }

    private static UUID parseUuid(String parameterName, String value) {
        if (value == null || value.isBlank()) {
            return null;
        }
        try {
            return UUID.fromString(value.trim());
        } catch (IllegalArgumentException exception) {
            throw new InvalidOrderQueryException(parameterName + " must be a UUID");
        }
    }
}
