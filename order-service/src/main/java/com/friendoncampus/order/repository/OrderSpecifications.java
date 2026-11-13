package com.friendoncampus.order.repository;

import java.time.OffsetDateTime;
import java.util.Collection;
import java.util.UUID;

import org.springframework.data.jpa.domain.Specification;

import com.friendoncampus.order.domain.Order;
import com.friendoncampus.order.domain.OrderState;

/** Query building blocks for the open-order pool and the "my orders" history lists. */
public final class OrderSpecifications {

    private OrderSpecifications() {
    }

    /**
     * Orders a courier can take right now: OPEN, pickup deadline still ahead (an overdue order is
     * not offered even before the expiry job reaches it), no reward change waiting on Credit, and
     * not requested by the caller.
     */
    public static Specification<Order> availableTo(UUID callerId, OffsetDateTime now) {
        return (root, query, cb) -> cb.and(
                cb.equal(root.get("state"), OrderState.OPEN),
                cb.greaterThan(root.<OffsetDateTime>get("pickupDeadline"), now),
                cb.isNull(root.get("pendingCreditReward")),
                cb.isNull(root.get("reviewCaseId")),
                cb.notEqual(root.get("requesterId"), callerId));
    }

    public static Specification<Order> rewardAtLeast(int minReward) {
        return (root, query, cb) -> cb.greaterThanOrEqualTo(root.<Integer>get("creditReward"), minReward);
    }

    public static Specification<Order> rewardAtMost(int maxReward) {
        return (root, query, cb) -> cb.lessThanOrEqualTo(root.<Integer>get("creditReward"), maxReward);
    }

    public static Specification<Order> pickupAt(UUID locationId) {
        return (root, query, cb) -> cb.equal(root.get("pickupLocationId"), locationId);
    }

    public static Specification<Order> dropoffAt(UUID locationId) {
        return (root, query, cb) -> cb.equal(root.get("dropoffLocationId"), locationId);
    }

    public static Specification<Order> requestedBy(UUID requesterId) {
        return (root, query, cb) -> cb.equal(root.get("requesterId"), requesterId);
    }

    public static Specification<Order> deliveredBy(UUID courierId) {
        return (root, query, cb) -> cb.equal(root.get("courierId"), courierId);
    }

    public static Specification<Order> reviewVisibility(boolean reviewing) {
        return (root,query,cb)->reviewing ? cb.and(cb.isNotNull(root.get("reviewCaseId")),cb.isNull(root.get("reviewResolvedAt"))) : cb.or(cb.isNull(root.get("reviewCaseId")),cb.isNotNull(root.get("reviewResolvedAt")));
    }
    public static Specification<Order> reviewCourier(UUID courier) {
        return (root,query,cb)->{
            var history=query.subquery(java.util.UUID.class);var row=history.from(com.friendoncampus.order.domain.OrderTransitionRecord.class);
            history.select(row.get("orderId")).where(cb.equal(row.get("courierId"),courier),cb.equal(row.get("orderId"),root.get("id")));
            return cb.or(cb.equal(root.get("courierId"),courier),cb.and(cb.isNotNull(root.get("reviewCaseId")),cb.exists(history)));
        };
    }
    public static Specification<Order> inStatesIncludingResolvedReviews(Collection<OrderState> states,boolean includeReviewed) {
        return (root,query,cb)->includeReviewed ? cb.or(root.get("state").in(states),cb.isNotNull(root.get("reviewResolvedAt"))) : root.get("state").in(states);
    }
    public static Specification<Order> inStates(Collection<OrderState> states) {
        return (root, query, cb) -> root.get("state").in(states);
    }
}
