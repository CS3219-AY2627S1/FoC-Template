package com.cs3219.foc.credit.infrastructure.messaging.producer;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

import com.cs3219.foc.credit.config.EventMessagingProperties;
import com.cs3219.foc.credit.model.dto.event.*;
import io.awspring.cloud.sns.core.SnsNotification;
import io.awspring.cloud.sns.core.SnsOperations;
import java.time.OffsetDateTime;
import java.util.UUID;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.mockito.ArgumentCaptor;
import org.springframework.messaging.MessagingException;

class SnsCreditEventPublisherTests {
    private static final String TOPIC = "arn:aws:sns:ap-southeast-1:000000000000:foc-dev-credit-events";
    private final SnsOperations sns = mock(SnsOperations.class);
    private final EventMessagingProperties properties = new EventMessagingProperties(TOPIC, "foc-dev-credit-events");
    private final UUID eventId = UUID.randomUUID();
    private final UUID operationId = UUID.randomUUID();
    private final UUID errandId = UUID.randomUUID();
    private final UUID requesterId = UUID.randomUUID();
    private final UUID courierId = UUID.randomUUID();
    private final OffsetDateTime occurredAt = OffsetDateTime.now();

    @ParameterizedTest
    @ValueSource(
            strings = {
                "CreditPaidEvent",
                "CreditPaymentDeclinedEvent",
                "CreditRefundedEvent",
                "CreditRefundDeclinedEvent"
            })
    void publishesEventTypeAndEventId(String type) {
        var event = publish(type);
        ArgumentCaptor<SnsNotification<?>> notification = ArgumentCaptor.captor();
        verify(sns).sendNotification(eq(TOPIC), notification.capture());
        assertThat(notification.getValue().getPayload()).isEqualTo(event);
        assertThat(notification.getValue().getHeaders())
                .containsEntry("eventType", type)
                .containsEntry("eventId", eventId.toString());
    }

    @ParameterizedTest
    @ValueSource(
            strings = {
                "CreditPaidEvent",
                "CreditPaymentDeclinedEvent",
                "CreditRefundedEvent",
                "CreditRefundDeclinedEvent"
            })
    void publishFailurePropagates(String type) {
        doThrow(new MessagingException("sns down")).when(sns).sendNotification(any(), any());
        assertThatThrownBy(() -> publish(type)).isInstanceOf(MessagingException.class);
    }

    private Object publish(String type) {
        return switch (type) {
            case CreditPaidEvent.TYPE -> {
                var event = new CreditPaidEvent(
                        eventId,
                        1,
                        occurredAt,
                        new CreditPaidEvent.Payload(operationId, errandId, requesterId, 80, courierId));
                new SnsCreditPaidEventPublisher(sns, properties).publish(event);
                yield event;
            }
            case CreditPaymentDeclinedEvent.TYPE -> {
                var event = new CreditPaymentDeclinedEvent(
                        eventId,
                        1,
                        occurredAt,
                        new CreditPaymentDeclinedEvent.Payload(
                                operationId, errandId, requesterId, 80, courierId, "TERMINAL_CONFLICT"));
                new SnsCreditPaymentDeclinedEventPublisher(sns, properties).publish(event);
                yield event;
            }
            case CreditRefundedEvent.TYPE -> {
                var event = new CreditRefundedEvent(
                        eventId,
                        1,
                        occurredAt,
                        new CreditRefundedEvent.Payload(operationId, errandId, requesterId, 80));
                new SnsCreditRefundedEventPublisher(sns, properties).publish(event);
                yield event;
            }
            case CreditRefundDeclinedEvent.TYPE -> {
                var event = new CreditRefundDeclinedEvent(
                        eventId,
                        1,
                        occurredAt,
                        new CreditRefundDeclinedEvent.Payload(
                                operationId, errandId, requesterId, 80, "TERMINAL_CONFLICT"));
                new SnsCreditRefundDeclinedEventPublisher(sns, properties).publish(event);
                yield event;
            }
            default -> throw new AssertionError(type);
        };
    }
}
