package com.friendoncampus.notification.retention;

import java.time.Clock;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.EnableScheduling;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * The retention job. Turned off with {@code NOTIFICATION_RETENTION_ENABLED=false}; nothing is then
 * deleted and no retention bean exists, so the service also starts without a database (as some tests
 * do).
 */
@Configuration
@EnableScheduling
@EnableConfigurationProperties(RetentionProperties.class)
@ConditionalOnProperty(name = "app.retention.enabled", havingValue = "true", matchIfMissing = true)
public class RetentionConfiguration {

    @Bean
    RetentionRepository retentionRepository(JdbcTemplate jdbc) {
        return new RetentionRepository(jdbc);
    }

    @Bean
    RetentionService retentionService(RetentionRepository repository, RetentionProperties properties,
            TransactionTemplate transactions, Clock clock) {
        return new RetentionService(repository, properties, transactions, clock);
    }

    /** The timer; {@code app.retention.schedule.enabled=false} keeps the beans but never runs it. */
    @Bean
    @ConditionalOnProperty(name = "app.retention.schedule.enabled", havingValue = "true", matchIfMissing = true)
    RetentionSchedule retentionSchedule(RetentionService retention) {
        return new RetentionSchedule(retention);
    }

    /** Runs the policy on a timer. */
    static class RetentionSchedule {

        private final RetentionService retention;

        RetentionSchedule(RetentionService retention) {
            this.retention = retention;
        }

        @Scheduled(initialDelayString = "${app.retention.initial-delay-ms:60000}",
                fixedDelayString = "${app.retention.interval-ms:3600000}")
        void run() {
            retention.run();
        }
    }
}
