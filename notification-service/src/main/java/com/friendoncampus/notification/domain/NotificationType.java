package com.friendoncampus.notification.domain;

/**
 * What a notification tells its recipient; picks the message template and icon. Stored as text
 * without a database CHECK, so adding a value needs no migration. See DESIGN.md "Notification types".
 */
public enum NotificationType {
    /** {@code OrderTransitioned} PENDING_CREDIT to OPEN: the requester's errand is live. */
    ORDER_OPENED,
    /**
     * To RESERVATION_FAILED, or EXPIRE from PENDING_CREDIT (Credit did not answer by the credit
     * timeout): the reward was not reserved, so the errand was not posted.
     */
    ORDER_RESERVATION_FAILED,
    /** OPEN to ACCEPTED: a courier accepted the requester's errand. */
    ORDER_ACCEPTED,
    /** ACCEPTED to OPEN: the courier withdrew and the errand is back in the pool. */
    ORDER_COURIER_WITHDREW,
    /** To EXPIRED: the pickup deadline passed before pickup. */
    ORDER_EXPIRED,
    /** ACCEPTED to CANCELLED: the requester cancelled; told to the courier they removed. */
    ORDER_CANCELLED,
    /** To PICKED_UP: the courier picked the item up. */
    ORDER_PICKED_UP,
    /** To DELIVERED: the courier delivered; the requester should confirm receipt. */
    ORDER_DELIVERED,
    /** To COMPLETED: the requester confirmed receipt; told to the courier. */
    ORDER_COMPLETED,
    /** Reminder: nobody has accepted the requester's open errand, 30 minutes before pickup. */
    ORDER_STILL_OPEN,
    /** Reminder: the assigned courier has 15 minutes left to pick up. */
    PICKUP_DUE_SOON,
    /** Reminder: the assigned courier has reached the pickup deadline without picking up. */
    PICKUP_OVERDUE,
    /** {@code CreditAccountAllocated}: the new account received its starting credits. */
    CREDITS_WELCOME,
    /** {@code CreditSettled}: the courier was paid the reward for a completed errand. */
    CREDITS_RECEIVED,
    /** {@code CourierCompensated}: the courier was compensated for an errand cancelled after acceptance. */
    CREDITS_COMPENSATED,
    /** A requester or courier sent this user a private errand-chat message. */
    CHAT_MESSAGE_RECEIVED
}
