package com.friendoncampus.order.domain;

/** Who performed a transition; {@link #SYSTEM} covers the scheduler and Credit replies. */
public enum ActorRole {
    REQUESTER,
    COURIER,
    SYSTEM
}
