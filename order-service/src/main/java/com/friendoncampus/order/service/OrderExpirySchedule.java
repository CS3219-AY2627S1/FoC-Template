package com.friendoncampus.order.service;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.annotation.EnableScheduling;
import org.springframework.scheduling.annotation.Scheduled;

/** Runs the expiry job on a timer; turn it off with {@code app.orders.expiry.enabled=false}. */
@Configuration
@EnableScheduling
@ConditionalOnProperty(name = "app.orders.expiry.enabled", havingValue = "true", matchIfMissing = true)
public class OrderExpirySchedule {

    private final OrderExpiryScheduler expiryScheduler;

    public OrderExpirySchedule(OrderExpiryScheduler expiryScheduler) {
        this.expiryScheduler = expiryScheduler;
    }

    @Scheduled(fixedDelayString = "${app.orders.expiry.interval-ms:30000}")
    public void run() {
        expiryScheduler.expireOverdueOrders();
    }
}
