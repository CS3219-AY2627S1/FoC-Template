package com.friendoncampus.credit.integration;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.util.List;
import java.util.UUID;
import java.util.concurrent.CompletableFuture;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.kafka.support.SendResult;

import com.friendoncampus.credit.domain.CreditOutboxEvent;

@ExtendWith(MockitoExtension.class)
class CreditOutboxPublisherTest {
    @Mock CreditOutboxService outbox;
    @Mock CreditEventJsonCodec codec;
    @Mock KafkaTemplate<String, String> kafka;
    @Mock CreditOutboxEvent event;

    private CreditOutboxPublisher publisher;

    @BeforeEach
    void setUp() {
        publisher = new CreditOutboxPublisher(outbox, codec, kafka, "credit.events", 50);
    }

    @Test
    void marksPublishedOnlyAfterKafkaAcknowledgesTheRecord() {
        UUID eventId = UUID.randomUUID();
        UUID orderId = UUID.randomUUID();
        when(event.getEventId()).thenReturn(eventId);
        when(event.getAggregateId()).thenReturn(orderId);
        when(outbox.pending(50)).thenReturn(List.of(event));
        when(codec.serialize(event)).thenReturn("{}");
        CompletableFuture<SendResult<String, String>> acknowledged = new CompletableFuture<>();
        acknowledged.complete(null);
        when(kafka.send("credit.events", orderId.toString(), "{}")).thenReturn(acknowledged);

        publisher.publishPending();

        verify(outbox).markPublished(eventId);
        verify(outbox, never()).recordPublishFailure(eq(eventId), any());
    }
}
