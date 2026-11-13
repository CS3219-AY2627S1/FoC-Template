package com.friendoncampus.order.domain;

/** Lifecycle actions recorded in the transition history. */
public enum OrderAction {
    REVIEW_STARTED,
    DISPUTE_RESOLVED,
    SUBMIT,
    OPEN,
    FAIL_RESERVATION,
    CANCEL,
    EXPIRE,
    ACCEPT,
    WITHDRAW,
    PICK_UP,
    DELIVER,
    COMPLETE,
    /** The requester edited an OPEN order's details and/or requested a new reward (T4, T5). */
    EDIT,
    /** Credit confirmed the reward change; the pending reward became the reward (T5a). */
    REWARD_CHANGE_APPLIED,
    /** Credit rejected the reward change; the previous reward stands (T5b). */
    REWARD_CHANGE_REJECTED
}
