package com.friendoncampus.user.messaging;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;
import java.time.Clock;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.CompletableFuture;
import org.apache.kafka.clients.producer.Producer;
import org.apache.kafka.clients.producer.ProducerRecord;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Captor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;

@ExtendWith(MockitoExtension.class)
class UserOutboxPublisherTest {
    private static final Instant NOW = Instant.parse("2030-01-01T00:00:00Z");
    @Mock UserOutboxRepository outbox;
    @Mock Producer<String, String> producer;
    @Captor ArgumentCaptor<ProducerRecord<String, String>> sent;
    UserOutboxPublisher publisher;
    UserOutboxEvent event;

    @BeforeEach void setUp() {
        publisher = new UserOutboxPublisher(outbox, producer, new UserEventSettings(true, "kafka:9092",
                "SASL_PLAINTEXT", "PLAIN", "user_service", "test-password", 100, 10000, 10),
                Clock.fixed(NOW, ZoneOffset.UTC), new SimpleMeterRegistry());
        event = UserOutboxEvent.activation(UUID.randomUUID(), UUID.randomUUID(), UUID.randomUUID(),
                UUID.randomUUID(), OffsetDateTime.ofInstant(NOW, ZoneOffset.UTC), "stored-exact-json");
    }

    @Test void marksPublishedOnlyAfterAcknowledgementAndUsesUserUuidAsKey() {
        when(outbox.lockNextReady(any())).thenReturn(Optional.of(event));
        when(producer.send(any())).thenReturn(CompletableFuture.completedFuture(null));
        assertThat(publisher.publishNext()).isTrue();
        verify(producer).send(sent.capture());
        assertThat(sent.getValue().topic()).isEqualTo("user.events");
        assertThat(sent.getValue().key()).isEqualTo(event.getUserId().toString());
        assertThat(sent.getValue().value()).isEqualTo(event.getPayload());
        assertThat(event.getPublishedAt()).isEqualTo(OffsetDateTime.ofInstant(NOW, ZoneOffset.UTC));
        assertThat(event.getAttemptCount()).isEqualTo(1);
    }

    @Test void brokerFailureRemainsPendingAndRetryReusesExactRecordAndIdentities() {
        UUID originalId = event.getEventId();
        UUID originalOperation = event.getOperationId();
        when(outbox.lockNextReady(any())).thenReturn(Optional.of(event));
        when(producer.send(any())).thenReturn(
                CompletableFuture.failedFuture(new org.apache.kafka.common.errors.TimeoutException("not logged")),
                CompletableFuture.completedFuture(null));
        publisher.publishNext();
        assertThat(event.getPublishedAt()).isNull();
        assertThat(event.getLastFailure()).isEqualTo("TIMEOUT");
        assertThat(event.getNextAttemptAt()).isEqualTo(OffsetDateTime.ofInstant(NOW.plusSeconds(10), ZoneOffset.UTC));
        publisher.publishNext();
        verify(producer, times(2)).send(sent.capture());
        assertThat(sent.getAllValues().get(0).value()).isEqualTo(sent.getAllValues().get(1).value());
        assertThat(event.getEventId()).isEqualTo(originalId);
        assertThat(event.getOperationId()).isEqualTo(originalOperation);
        assertThat(event.getPublishedAt()).isNotNull();
        assertThat(event.getLastFailure()).isNull();
    }

    @Test void aSendWithoutAcknowledgementIsNotMarkedPublished() {
        when(outbox.lockNextReady(any())).thenReturn(Optional.of(event));
        when(producer.send(any())).thenReturn(new CompletableFuture<>());
        publisher.publishNext();
        assertThat(event.getPublishedAt()).isNull();
        assertThat(event.getLastFailure()).isEqualTo("TIMEOUT");
    }

    @Test void authorizationFailuresRemainRecoverableWithoutStoringExceptionMessages() {
        when(outbox.lockNextReady(any())).thenReturn(Optional.of(event));
        when(producer.send(any())).thenReturn(CompletableFuture.failedFuture(
                new org.apache.kafka.common.errors.TopicAuthorizationException("sensitive diagnostic")));
        publisher.publishNext();
        assertThat(event.getLastFailure()).isEqualTo("AUTHORIZATION");
        assertThat(event.getPublishedAt()).isNull();
    }

    @Test void emptyQueueDoesNotConnectToKafka() {
        when(outbox.lockNextReady(any())).thenReturn(Optional.empty());
        assertThat(publisher.publishNext()).isFalse();
        verifyNoInteractions(producer);
    }
}
