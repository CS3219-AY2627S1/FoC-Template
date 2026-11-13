package com.friendoncampus.order.service;

import com.friendoncampus.order.domain.OrderErrorCode;
import com.friendoncampus.order.domain.OrderState;
import com.friendoncampus.order.domain.OrderTransitionException;

/**
 * An action reached an OPEN order whose pickup deadline had passed. The order was expired in the
 * same transaction (lazy expiry) and that expiry is committed; only the requested action is
 * rejected.
 */
public class OrderExpiredOnActionException extends OrderTransitionException {

    public OrderExpiredOnActionException() {
        super(OrderErrorCode.ORDER_EXPIRED, OrderState.EXPIRED, "This order's pickup deadline has passed");
    }
}
