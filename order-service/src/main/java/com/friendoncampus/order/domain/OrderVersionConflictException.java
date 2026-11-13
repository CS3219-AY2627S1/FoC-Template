package com.friendoncampus.order.domain;

/** An edit was based on an out-of-date {@code version}; the client must reload and retry. */
public class OrderVersionConflictException extends OrderTransitionException {

    private final long currentVersion;

    public OrderVersionConflictException(OrderState currentState, long requestedVersion, long currentVersion) {
        super(OrderErrorCode.VERSION_CONFLICT, currentState,
                "The order changed since version " + requestedVersion + "; reload it and try again");
        this.currentVersion = currentVersion;
    }

    public long getCurrentVersion() {
        return currentVersion;
    }
}
