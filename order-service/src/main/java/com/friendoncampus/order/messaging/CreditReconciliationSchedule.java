package com.friendoncampus.order.messaging;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.annotation.EnableScheduling;
import org.springframework.scheduling.annotation.Scheduled;

/**
 * Runs {@link CreditReconciliation} on a timer; turn it off with
 * {@code app.orders.credit-reconciliation.enabled=false}. Read-only, so every replica may run it.
 */
@Configuration
@EnableScheduling
@ConditionalOnProperty(name = "app.orders.credit-reconciliation.enabled", havingValue = "true", matchIfMissing = true)
public class CreditReconciliationSchedule {

    private final CreditReconciliation reconciliation;

    public CreditReconciliationSchedule(CreditReconciliation reconciliation) {
        this.reconciliation = reconciliation;
    }

    @Scheduled(fixedDelayString = "${app.orders.credit-reconciliation.interval-ms:300000}",
            initialDelayString = "${app.orders.credit-reconciliation.interval-ms:300000}")
    public void run() {
        reconciliation.check();
    }
}
