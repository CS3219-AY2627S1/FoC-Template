package com.cs3219.foc.order.infrastructure.messaging.consumer;

import com.cs3219.foc.order.infrastructure.messaging.EventValidator;
import com.cs3219.foc.order.model.dto.event.*;
import com.cs3219.foc.order.service.OrderService;
import io.awspring.cloud.sqs.annotation.SqsListener;
import lombok.RequiredArgsConstructor;
import org.springframework.messaging.handler.annotation.Header;
import org.springframework.stereotype.Component;
import tools.jackson.databind.ObjectMapper;

@Component
@RequiredArgsConstructor
public class SqsCreditEventConsumer {
    private final ObjectMapper objectMapper;
    private final EventValidator eventValidator;
    private final OrderService orderService;

    @SqsListener(value = "${events.messaging.queue-name}", acknowledgementMode = "ON_SUCCESS")
    public void consume(@Header("eventType") String eventType, String body) {
        switch (eventType) {
            case CreditPaidEvent.TYPE -> orderService.confirmPayment(readValidatedEvent(body, CreditPaidEvent.class));
            case CreditPaymentDeclinedEvent.TYPE ->
                orderService.recordPaymentDeclined(readValidatedEvent(body, CreditPaymentDeclinedEvent.class));
            case CreditRefundedEvent.TYPE ->
                orderService.confirmRefund(readValidatedEvent(body, CreditRefundedEvent.class));
            case CreditRefundDeclinedEvent.TYPE ->
                orderService.recordRefundDeclined(readValidatedEvent(body, CreditRefundDeclinedEvent.class));
            default -> throw new IllegalArgumentException("Unexpected event type: " + eventType);
        }
    }

    private <T> T readValidatedEvent(String body, Class<T> eventType) {
        var event = objectMapper.readValue(body, eventType);
        eventValidator.validateEvent(event);
        return event;
    }
}
