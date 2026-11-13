package com.friendoncampus.order.service;

import com.friendoncampus.order.domain.Order;

/**
 * The order a create request produced. {@code replayed} is true when the request repeated an
 * earlier one with the same {@code Idempotency-Key}, so the existing order was returned and nothing
 * was written.
 */
public record CreateOrderResult(Order order, boolean replayed) {
}
