package com.cs3219.foc.order.infrastructure.messaging;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

import com.cs3219.foc.order.config.EventMessagingProperties;
import com.cs3219.foc.order.exception.ValidationFailedException;
import com.cs3219.foc.order.infrastructure.messaging.consumer.SqsCreditEventConsumer;
import com.cs3219.foc.order.infrastructure.messaging.producer.SnsErrandEventPublisher;
import com.cs3219.foc.order.model.dto.event.*;
import com.cs3219.foc.order.service.OrderService;
import io.awspring.cloud.sns.core.SnsNotification;
import io.awspring.cloud.sns.core.SnsOperations;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.mockito.ArgumentCaptor;
import org.springframework.messaging.MessagingException;
import org.springframework.validation.FieldError;
import org.springframework.validation.beanvalidation.LocalValidatorFactoryBean;
import tools.jackson.databind.json.JsonMapper;
import tools.jackson.databind.node.ObjectNode;

class MessagingContractTests {
    private static final String TOPIC = "arn:aws:sns:ap-southeast-1:000000000000:foc-dev-order-events";
    private final SnsOperations sns = mock(SnsOperations.class);
    private final SnsErrandEventPublisher publisher =
            new SnsErrandEventPublisher(sns, new EventMessagingProperties(TOPIC, "orders"));
    private final JsonMapper json = JsonMapper.builder().build();
    private final UUID eventId = UUID.randomUUID();
    private final UUID errandId = UUID.randomUUID();
    private final UUID requesterId = UUID.randomUUID();
    private final UUID courierId = UUID.randomUUID();
    private final OffsetDateTime occurredAt = OffsetDateTime.parse("2026-10-22T10:00:00Z");
    private final OrderService service = mock(OrderService.class);
    private final LocalValidatorFactoryBean validator = new LocalValidatorFactoryBean();
    private SqsCreditEventConsumer consumer;

    @BeforeEach
    void setUp() {
        validator.afterPropertiesSet();
        consumer = new SqsCreditEventConsumer(json, new EventValidator(validator), service);
    }

    @AfterEach
    void closeValidator() {
        validator.close();
    }

    @Test
    void publisherFailuresRemainVisibleToThePublicationRegistry() {
        var failure = new MessagingException("SNS unavailable");
        doThrow(failure).when(sns).sendNotification(anyString(), any());
        assertThatThrownBy(() -> publisher.publish(new ErrandCancelledEvent(
                        eventId, 1, occurredAt, new ErrandCancelledEvent.Payload(errandId, requesterId, 80))))
                .isSameAs(failure);
    }

    private static final String[] TYPES = {
        CreditPaidEvent.TYPE, CreditPaymentDeclinedEvent.TYPE, CreditRefundedEvent.TYPE, CreditRefundDeclinedEvent.TYPE
    };

    @Test
    void chatMessagesArePublishedWithTheirTypeForTheRealtimeService() {
        var event = new ErrandMessagePostedEvent(
                eventId,
                1,
                occurredAt,
                new ErrandMessagePostedEvent.Payload(
                        UUID.randomUUID(),
                        errandId,
                        requesterId,
                        List.of(requesterId, courierId),
                        "Less ice please",
                        null,
                        occurredAt));
        publisher.publish(event);
        var notification = ArgumentCaptor.forClass(SnsNotification.class);
        verify(sns).sendNotification(eq(TOPIC), notification.capture());
        assertThat(notification.getValue().getPayload()).isEqualTo(event);
        assertThat(notification.getValue().getHeaders())
                .containsEntry("eventType", "ErrandMessagePostedEvent")
                .containsEntry("eventId", eventId.toString());
    }

    @Test
    void readReceiptsArePublishedWithTheirType() {
        var event = new ErrandChatReadEvent(
                eventId,
                1,
                occurredAt,
                new ErrandChatReadEvent.Payload(errandId, courierId, List.of(requesterId, courierId), occurredAt));
        publisher.publish(event);
        var notification = ArgumentCaptor.forClass(SnsNotification.class);
        verify(sns).sendNotification(eq(TOPIC), notification.capture());
        assertThat(notification.getValue().getHeaders()).containsEntry("eventType", "ErrandChatReadEvent");
    }

    @Test
    void invalidResultsNeverReachTheOrderService() {
        assertThatThrownBy(() -> consumer.consume("UnknownEvent", "{}")).isInstanceOf(IllegalArgumentException.class);
        for (String type : TYPES) {
            assertThatThrownBy(() -> consumer.consume(type, "not json")).isInstanceOf(RuntimeException.class);
            assertThatThrownBy(() -> consumer.consume(type, "{}")).isInstanceOf(RuntimeException.class);
            var future = validBody(type);
            future.put("schemaVersion", 2);
            assertThatThrownBy(() -> consumer.consume(type, future.toString()))
                    .isInstanceOf(ValidationFailedException.class);
        }
        verifyNoInteractions(service);
    }

    @ParameterizedTest
    @ValueSource(
            strings = {
                "CreditPaidEvent",
                "CreditPaymentDeclinedEvent",
                "CreditRefundedEvent",
                "CreditRefundDeclinedEvent"
            })
    void validResultsReachTheirDedicatedOrderOperation(String type) {
        var body = validBody(type).toString();
        consumer.consume(type, body);
        switch (type) {
            case CreditPaidEvent.TYPE -> verify(service).confirmPayment(json.readValue(body, CreditPaidEvent.class));
            case CreditPaymentDeclinedEvent.TYPE ->
                verify(service).recordPaymentDeclined(json.readValue(body, CreditPaymentDeclinedEvent.class));
            case CreditRefundedEvent.TYPE ->
                verify(service).confirmRefund(json.readValue(body, CreditRefundedEvent.class));
            case CreditRefundDeclinedEvent.TYPE ->
                verify(service).recordRefundDeclined(json.readValue(body, CreditRefundDeclinedEvent.class));
            default -> throw new AssertionError(type);
        }
        verifyNoMoreInteractions(service);
    }

    @ParameterizedTest
    @ValueSource(
            strings = {
                "eventId",
                "occurredAt",
                "payload",
                "payload.operationId",
                "payload.errandId",
                "payload.requesterId"
            })
    void missingOrNullFieldsAreRejectedBeforeTheOrderService(String field) {
        for (String type : TYPES) {
            var body = validBody(type);
            var separator = field.indexOf('.');
            var parent = separator < 0 ? body : (ObjectNode) body.get("payload");
            var name = separator < 0 ? field : field.substring(separator + 1);
            parent.putNull(name);
            assertInvalidResult(type, body, field);
            parent.remove(name);
            assertInvalidResult(type, body, field);
        }
        verifyNoInteractions(service);
    }

    @ParameterizedTest
    @ValueSource(strings = {"CreditPaymentDeclinedEvent", "CreditRefundDeclinedEvent"})
    void declinedEventsRequireAReason(String type) {
        var body = validBody(type);
        var payload = (ObjectNode) body.get("payload");
        payload.put("reason", "  ");
        assertInvalidResult(type, body, "payload.reason");
        payload.putNull("reason");
        assertInvalidResult(type, body, "payload.reason");
        payload.remove("reason");
        assertInvalidResult(type, body, "payload.reason");
        verifyNoInteractions(service);
    }

    @ParameterizedTest
    @ValueSource(longs = {0, -1})
    void nonPositiveAmountsAreRejected(long amount) {
        for (String type : TYPES) {
            var body = validBody(type);
            ((ObjectNode) body.get("payload")).put("amount", amount);
            assertInvalidResult(type, body, "payload.amount");
        }
        verifyNoInteractions(service);
    }

    @ParameterizedTest
    @ValueSource(
            strings = {
                "CreditPaidEvent",
                "CreditPaymentDeclinedEvent",
                "CreditRefundedEvent",
                "CreditRefundDeclinedEvent"
            })
    void orderServiceFailuresPropagateToTheListener(String type) {
        var failure = new IllegalStateException("Database unavailable");
        switch (type) {
            case CreditPaidEvent.TYPE -> doThrow(failure).when(service).confirmPayment(any());
            case CreditPaymentDeclinedEvent.TYPE ->
                doThrow(failure).when(service).recordPaymentDeclined(any());
            case CreditRefundedEvent.TYPE -> doThrow(failure).when(service).confirmRefund(any());
            case CreditRefundDeclinedEvent.TYPE ->
                doThrow(failure).when(service).recordRefundDeclined(any());
            default -> throw new AssertionError(type);
        }
        assertThatThrownBy(() -> consumer.consume(type, validBody(type).toString()))
                .isSameAs(failure);
    }

    private ObjectNode validBody(String type) {
        var body = json.createObjectNode();
        body.put("eventId", eventId.toString());
        body.put("schemaVersion", 1);
        body.put("occurredAt", occurredAt.toString());
        var payload = body.putObject("payload");
        payload.put("operationId", UUID.randomUUID().toString());
        payload.put("errandId", errandId.toString());
        payload.put("requesterId", requesterId.toString());
        payload.put("amount", 80);
        if (type.equals(CreditPaidEvent.TYPE) || type.equals(CreditPaymentDeclinedEvent.TYPE))
            payload.put("courierId", courierId.toString());
        if (type.equals(CreditPaymentDeclinedEvent.TYPE) || type.equals(CreditRefundDeclinedEvent.TYPE))
            payload.put("reason", "TERMINAL_CONFLICT");
        return body;
    }

    private void assertInvalidResult(String type, ObjectNode body, String field) {
        assertThatThrownBy(() -> consumer.consume(type, body.toString()))
                .isInstanceOfSatisfying(ValidationFailedException.class, exception -> {
                    assertThat(exception.getValidationErrors().getFieldErrors())
                            .extracting(FieldError::getField)
                            .contains(field);
                });
    }
}
