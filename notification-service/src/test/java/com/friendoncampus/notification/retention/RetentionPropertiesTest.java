package com.friendoncampus.notification.retention;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;
import org.springframework.context.annotation.Configuration;

/** Startup refuses a retention policy that would break the DLT replay guarantee. */
class RetentionPropertiesTest {

    @Configuration
    @EnableConfigurationProperties(RetentionProperties.class)
    static class Properties {
    }

    private final ApplicationContextRunner context = new ApplicationContextRunner()
            .withUserConfiguration(Properties.class)
            .withPropertyValues("spring.main.lazy-initialization=false");

    @Test
    void theApprovedPolicyStarts() {
        context.run(started -> {
            assertThat(started).hasNotFailed();
            assertThat(started.getBean(RetentionProperties.class).batchSize()).isEqualTo(500);
        });
    }

    @Test
    void anInboxPeriodUnderThirtyDaysIsRejected() {
        context.withPropertyValues("app.retention.inbox=29d").run(started -> assertThat(started)
                .hasFailed()
                .getFailure().rootCause().hasMessageContaining("at least 30 days"));
    }

    @Test
    void aZeroOrNegativePeriodIsRejected() {
        context.withPropertyValues("app.retention.read-notifications=0d").run(started -> assertThat(started)
                .hasFailed());
        context.withPropertyValues("app.retention.all-notifications=-1d").run(started -> assertThat(started)
                .hasFailed());
    }

    @Test
    void aBatchSizeOutOfRangeIsRejected() {
        context.withPropertyValues("app.retention.batch-size=0").run(started -> assertThat(started).hasFailed());
    }
}
