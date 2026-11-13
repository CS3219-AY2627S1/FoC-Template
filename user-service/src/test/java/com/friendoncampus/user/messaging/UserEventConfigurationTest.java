package com.friendoncampus.user.messaging;

import static org.assertj.core.api.Assertions.*;
import org.apache.kafka.clients.producer.ProducerConfig;
import org.apache.kafka.common.config.SaslConfigs;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;
import java.time.Clock;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.Optional;
import java.util.UUID;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import static org.mockito.Mockito.*;

class UserEventConfigurationTest {
    @Test void unavailableBrokerDoesNotPreventStartupAndLeavesTheEventPending() {
        UserOutboxRepository outbox = mock(UserOutboxRepository.class);
        var now = OffsetDateTime.now(ZoneOffset.UTC);
        var event = UserOutboxEvent.activation(UUID.randomUUID(), UUID.randomUUID(), UUID.randomUUID(),
                UUID.randomUUID(), now, "{}");
        when(outbox.lockNextReady(any())).thenReturn(Optional.of(event));
        new ApplicationContextRunner().withUserConfiguration(UserEventConfiguration.class)
                .withBean(UserOutboxRepository.class, () -> outbox)
                .withBean(Clock.class, Clock::systemUTC)
                .withBean(io.micrometer.core.instrument.MeterRegistry.class, SimpleMeterRegistry::new)
                .withPropertyValues("app.events.enabled=true", "app.events.bootstrap-servers=unresolvable.invalid:9092",
                        "app.events.security-protocol=PLAINTEXT", "app.events.send-timeout-ms=100",
                        "app.events.retry-delay-ms=100", "app.events.batch-size=1",
                        "app.events.initial-delay-ms=3600000")
                .run(context -> {
                    assertThat(context).hasNotFailed();
                    assertThat(context.getBean(UserOutboxPublisher.class).publishNext()).isTrue();
                    assertThat(event.getPublishedAt()).isNull();
                    assertThat(event.getAttemptCount()).isEqualTo(1);
                    assertThat(event.getNextAttemptAt()).isAfter(now);
                    verify(outbox).save(event);
                });
    }

    private UserEventSettings settings(String protocol, String username, String password) {
        return settings(protocol, "PLAIN", username, password);
    }

    private UserEventSettings settings(String protocol, String mechanism, String username, String password) {
        return new UserEventSettings(true, "kafka:9092", protocol, mechanism, username, password,
                5000, 10000, 10);
    }

    @Test void authenticatesWithEscapedCredentialsAndIdempotentAcknowledgedProduction() {
        var settings = settings("SASL_PLAINTEXT", "user_service", "a\\b\"c");
        var properties = UserEventConfiguration.producerProperties(settings);
        assertThat(properties).containsEntry(ProducerConfig.ACKS_CONFIG, "all")
                .containsEntry(ProducerConfig.ENABLE_IDEMPOTENCE_CONFIG, true)
                .containsEntry(ProducerConfig.MAX_IN_FLIGHT_REQUESTS_PER_CONNECTION, 1);
        assertThat(properties.get(SaslConfigs.SASL_JAAS_CONFIG).toString())
                .contains("username=\"user_service\"").contains("password=\"a\\\\b\\\"c\"");
        assertThat(settings.toString()).doesNotContain("a\\b\"c", "user_service");
    }

    @Test void supportsEncryptedSaslConnectionsWithTheSameIdentityContract() {
        assertThat(UserEventConfiguration.producerProperties(settings("SASL_SSL", "user_service", "secret")))
                .containsEntry("security.protocol", "SASL_SSL");
    }

    @Test void supportsMskScramSha512WithoutChangingLocalPlainDefaults() {
        var properties = UserEventConfiguration.producerProperties(
                settings("SASL_SSL", "SCRAM-SHA-512", "user_service", "secret"));
        assertThat(properties).containsEntry(SaslConfigs.SASL_MECHANISM, "SCRAM-SHA-512");
        assertThat(properties.get(SaslConfigs.SASL_JAAS_CONFIG).toString())
                .startsWith("org.apache.kafka.common.security.scram.ScramLoginModule required")
                .contains("username=\"user_service\"");
    }

    @Test void failsClosedForMissingOrMultilineCredentialsAndUnsupportedProtocols() {
        for (String password : new String[]{"", "secret\ninjected", "secret\rvalue"}) {
            assertThatThrownBy(() -> UserEventConfiguration.producerProperties(
                    settings("SASL_PLAINTEXT", "user_service", password)))
                    .isInstanceOf(IllegalArgumentException.class)
                    .hasMessageNotContaining(password.isEmpty() ? "password=" : password);
        }
        assertThatThrownBy(() -> UserEventConfiguration.producerProperties(settings("invalid", "u", "p")))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> UserEventConfiguration.producerProperties(
                settings("SASL_SSL", "unsupported", "u", "p")))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @Test void permitsExplicitPlaintextForAnIsolatedTestBrokerWithoutLeakingSaslCredentials() {
        assertThat(UserEventConfiguration.producerProperties(settings("PLAINTEXT", "", "")))
                .doesNotContainKey(SaslConfigs.SASL_JAAS_CONFIG);
    }
}
