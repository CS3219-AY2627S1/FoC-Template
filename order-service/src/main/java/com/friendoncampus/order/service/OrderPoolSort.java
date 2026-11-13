package com.friendoncampus.order.service;

import java.util.Arrays;
import java.util.stream.Collectors;

import org.springframework.data.domain.Sort;

/**
 * Sort orders for the open-order pool (F4.3). Each one ends with {@code id} so paging is stable
 * when the leading keys tie.
 */
public enum OrderPoolSort {
    /** Highest reward first, then nearest pickup deadline. */
    REWARD("reward", Sort.by(Sort.Order.desc("creditReward"), Sort.Order.asc("pickupDeadline"),
            Sort.Order.asc("id"))),
    /** Nearest pickup deadline first. */
    DEADLINE("deadline", Sort.by(Sort.Order.asc("pickupDeadline"), Sort.Order.asc("id"))),
    /** Pickup location name A to Z ignoring case (orders without a stored name last), then deadline. */
    PICKUP_LOCATION_NAME("pickupLocationName", Sort.by(
            Sort.Order.asc("pickupLocationName").ignoreCase().nullsLast(),
            Sort.Order.asc("pickupDeadline"), Sort.Order.asc("id")));

    public static final OrderPoolSort DEFAULT = DEADLINE;

    private final String parameterValue;
    private final Sort sort;

    OrderPoolSort(String parameterValue, Sort sort) {
        this.parameterValue = parameterValue;
        this.sort = sort;
    }

    public String parameterValue() {
        return parameterValue;
    }

    public Sort sort() {
        return sort;
    }

    public static OrderPoolSort from(String value) {
        if (value == null) {
            return DEFAULT;
        }
        String trimmed = value.trim();
        return Arrays.stream(values())
                .filter(candidate -> candidate.parameterValue.equals(trimmed))
                .findFirst()
                .orElseThrow(() -> new InvalidOrderQueryException("Unsupported sort '" + trimmed
                        + "'. Allowed values: " + Arrays.stream(values())
                                .map(OrderPoolSort::parameterValue)
                                .collect(Collectors.joining(", "))));
    }
}
