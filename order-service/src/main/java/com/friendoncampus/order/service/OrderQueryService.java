package com.friendoncampus.order.service;

import java.time.Clock;
import java.time.OffsetDateTime;
import java.util.UUID;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.friendoncampus.order.domain.Order;
import com.friendoncampus.order.repository.OrderRepository;
import com.friendoncampus.order.repository.OrderSpecifications;

/** Read-only list queries: the open-order pool (F4) and the caller's order history (F9). */
@Service
public class OrderQueryService {

    /** Newest first, with {@code id} as a stable tiebreaker. */
    private static final Sort HISTORY_SORT = Sort.by(Sort.Order.desc("stateChangedAt"), Sort.Order.asc("id"));
    private static final Sort ACTIVE_SORT = Sort.by(Sort.Order.asc("pickupDeadline"), Sort.Order.asc("id"));

    private final OrderRepository orderRepository;
    private final Clock clock;

    public OrderQueryService(OrderRepository orderRepository, Clock clock) {
        this.orderRepository = orderRepository;
        this.clock = clock;
    }

    @Transactional(readOnly = true)
    public Page<Order> findOpenPool(UUID callerId, OrderPoolQuery query) {
        Specification<Order> specification = OrderSpecifications.availableTo(callerId, now());
        if (query.minReward() != null) {
            specification = specification.and(OrderSpecifications.rewardAtLeast(query.minReward()));
        }
        if (query.maxReward() != null) {
            specification = specification.and(OrderSpecifications.rewardAtMost(query.maxReward()));
        }
        if (query.pickupLocationId() != null) {
            specification = specification.and(OrderSpecifications.pickupAt(query.pickupLocationId()));
        }
        if (query.dropoffLocationId() != null) {
            specification = specification.and(OrderSpecifications.dropoffAt(query.dropoffLocationId()));
        }
        return orderRepository.findAll(specification, pageRequest(query.paging(), query.sort().sort()));
    }

    /**
     * The caller's own requests (F9.1). Past: COMPLETED, CANCELLED or EXPIRED, latest state change
     * first. Active: still in progress, soonest pickup deadline first.
     */
    @Transactional(readOnly = true)
    public Page<Order> findRequested(UUID callerId, MyOrdersFilter filter, OrderPaging paging) {
        Specification<Order> specification = OrderSpecifications.requestedBy(callerId)
                .and(OrderSpecifications.inStatesIncludingResolvedReviews(
                        filter.states(MyOrdersFilter.REQUESTED_ACTIVE, MyOrdersFilter.REQUESTED_PAST),filter.status()==MyOrdersFilter.Status.PAST && filter.state()==null))
                .and(OrderSpecifications.reviewVisibility(filter.status()==MyOrdersFilter.Status.REVIEW));
        return orderRepository.findAll(specification, pageRequest(paging, sortFor(filter)));
    }

    /**
     * Orders the caller runs as courier (F9.2). Past: COMPLETED deliveries. Active: errands still
     * assigned to the caller (accepted, picked up or delivered awaiting confirmation).
     */
    @Transactional(readOnly = true)
    public Page<Order> findDelivered(UUID callerId, MyOrdersFilter filter, OrderPaging paging) {
        Specification<Order> specification = OrderSpecifications.reviewCourier(callerId)
                .and(OrderSpecifications.inStatesIncludingResolvedReviews(
                        filter.states(MyOrdersFilter.DELIVERED_ACTIVE, MyOrdersFilter.DELIVERED_PAST),filter.status()==MyOrdersFilter.Status.PAST && filter.state()==null))
                .and(OrderSpecifications.reviewVisibility(filter.status()==MyOrdersFilter.Status.REVIEW));
        return orderRepository.findAll(specification, pageRequest(paging, sortFor(filter)));
    }

    private static Sort sortFor(MyOrdersFilter filter) {
        return filter.status() == MyOrdersFilter.Status.ACTIVE ? ACTIVE_SORT : HISTORY_SORT;
    }

    private static PageRequest pageRequest(OrderPaging paging, Sort sort) {
        return PageRequest.of(paging.page(), paging.size(), sort);
    }

    /** The current time at stored precision, matching how {@link OrderService} checks deadlines. */
    private OffsetDateTime now() {
        return Order.toStoredPrecision(OffsetDateTime.now(clock));
    }
}
