package com.friendoncampus.order.messaging;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.CompletableFuture;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.springframework.boot.test.system.CapturedOutput;
import org.springframework.boot.test.system.OutputCaptureExtension;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.kafka.support.SendResult;

import com.friendoncampus.order.repository.OutboxEventRepository;

@ExtendWith(OutputCaptureExtension.class)
class OutboxRelayTest {

    private static final Instant NOW = Instant.parse("2026-10-18T10:00:00Z");

    private OutboxEventRepository repository;
    private KafkaTemplate<String, String> kafka;
    private OutboxRelay relay;

    @BeforeEach
    @SuppressWarnings("unchecked")
    void setUp() {
        repository = mock(OutboxEventRepository.class);
        kafka = mock(KafkaTemplate.class);
        relay = new OutboxRelay(repository, kafka, Clock.fixed(NOW, ZoneOffset.UTC), 100, Duration.ofSeconds(1));
    }

    private static OutboxEvent event(UUID orderId, long version) {
        return new OutboxEvent(UUID.randomUUID(), orderId, version, "OrderSubmitted", "order.events",
                UUID.randomUUID(), "{\"v\":" + version + "}", OffsetDateTime.ofInstant(NOW, ZoneOffset.UTC));
    }

    private static CompletableFuture<SendResult<String, String>> acked() {
        return CompletableFuture.completedFuture(null);
    }

    private static CompletableFuture<SendResult<String, String>> failed() {
        return CompletableFuture.failedFuture(new IllegalStateException("broker down"));
    }

    @Test
    void marksAnEventPublishedOnlyAfterKafkaAcknowledges() {
        UUID orderId = UUID.randomUUID();
        OutboxEvent event = event(orderId, 0);
        when(repository.claimUnpublished(100)).thenReturn(List.of(event));
        when(kafka.send("order.events", orderId.toString(), "{\"v\":0}")).thenReturn(acked());

        assertThat(relay.publishPending()).isEqualTo(1);

        assertThat(event.getPublishedAt()).isEqualTo(OffsetDateTime.ofInstant(NOW, ZoneOffset.UTC));
        assertThat(event.getAttempts()).isZero();
    }

    @Test
    void aFailedSendStaysPendingAndCountsTheAttempt() {
        OutboxEvent event = event(UUID.randomUUID(), 0);
        when(repository.claimUnpublished(100)).thenReturn(List.of(event));
        when(kafka.send(anyString(), anyString(), anyString())).thenReturn(failed());

        assertThat(relay.publishPending()).isZero();

        assertThat(event.getPublishedAt()).isNull();
        assertThat(event.getAttempts()).isEqualTo(1);
    }

    @Test
    void afterAFailureTheSameOrdersLaterEventsWaitButOtherOrdersContinue() {
        UUID stuck = UUID.randomUUID();
        UUID other = UUID.randomUUID();
        OutboxEvent first = event(stuck, 0);
        OutboxEvent second = event(stuck, 1);
        OutboxEvent unrelated = event(other, 0);
        when(repository.claimUnpublished(100)).thenReturn(List.of(first, second, unrelated));
        when(kafka.send("order.events", stuck.toString(), "{\"v\":0}")).thenReturn(failed());
        when(kafka.send("order.events", other.toString(), "{\"v\":0}")).thenReturn(acked());

        assertThat(relay.publishPending()).isEqualTo(1);

        verify(kafka, never()).send(eq("order.events"), eq(stuck.toString()), eq("{\"v\":1}"));
        assertThat(second.getPublishedAt()).isNull();
        assertThat(second.getAttempts()).isZero();
        assertThat(unrelated.getPublishedAt()).isNotNull();
    }

    @Test
    void theNextRunRetriesAndPublishes() {
        UUID orderId = UUID.randomUUID();
        OutboxEvent event = event(orderId, 0);
        when(repository.claimUnpublished(100)).thenReturn(List.of(event));
        when(kafka.send("order.events", orderId.toString(), "{\"v\":0}")).thenReturn(failed(), acked());

        relay.publishPending();
        relay.publishPending();

        assertThat(event.getAttempts()).isEqualTo(1);
        assertThat(event.getPublishedAt()).isNotNull();
    }

    @Test
    void aFailingLifecycleEventDoesNotHoldBackTheSameOrdersCreditRequests() {
        UUID orderId = UUID.randomUUID();
        OutboxEvent lifecycle = new OutboxEvent(UUID.randomUUID(), orderId, 0, "OrderTransitioned",
                "order.lifecycle.events", null, "{\"lifecycle\":0}", OffsetDateTime.ofInstant(NOW, ZoneOffset.UTC));
        OutboxEvent laterLifecycle = new OutboxEvent(UUID.randomUUID(), orderId, 1, "OrderTransitioned",
                "order.lifecycle.events", null, "{\"lifecycle\":1}", OffsetDateTime.ofInstant(NOW, ZoneOffset.UTC));
        OutboxEvent credit = event(orderId, 1);
        when(repository.claimUnpublished(100)).thenReturn(List.of(lifecycle, credit, laterLifecycle));
        when(kafka.send("order.lifecycle.events", orderId.toString(), "{\"lifecycle\":0}")).thenReturn(failed());
        when(kafka.send("order.events", orderId.toString(), "{\"v\":1}")).thenReturn(acked());

        assertThat(relay.publishPending()).isEqualTo(1);

        assertThat(credit.getPublishedAt()).isNotNull();
        // Its own topic still keeps order: the later lifecycle event waits.
        verify(kafka, never()).send(eq("order.lifecycle.events"), eq(orderId.toString()), eq("{\"lifecycle\":1}"));
        assertThat(laterLifecycle.getPublishedAt()).isNull();
    }

    @Test
    void anEventFailingTheStuckThresholdIsReportedOnce(CapturedOutput output) {
        OutboxRelay strict = new OutboxRelay(repository, kafka, Clock.fixed(NOW, ZoneOffset.UTC), 100,
                Duration.ofSeconds(1), 2);
        OutboxEvent event = event(UUID.randomUUID(), 0);
        when(repository.claimUnpublished(100)).thenReturn(List.of(event));
        when(kafka.send(anyString(), anyString(), anyString())).thenReturn(failed());

        strict.publishPending();
        assertThat(output.getOut()).doesNotContain("is stuck");
        strict.publishPending();
        strict.publishPending();

        assertThat(event.getAttempts()).isEqualTo(3);
        assertThat(event.getPublishedAt()).isNull();
        assertThat(output.getOut().split("is stuck", -1)).hasSize(2);
        assertThat(output.getOut()).contains("eventId=" + event.getId());
    }
}
