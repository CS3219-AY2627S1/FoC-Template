package com.cs3219.foc.credit.infrastructure.messaging.consumer;

import com.cs3219.foc.credit.infrastructure.messaging.EventValidator;
import com.cs3219.foc.credit.model.dto.event.ErrandCancelledEvent;
import com.cs3219.foc.credit.model.dto.event.ErrandCompletedEvent;
import com.cs3219.foc.credit.model.dto.event.ErrandExpiredEvent;
import com.cs3219.foc.credit.model.dto.event.UserCreatedEvent;
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
    private final UserCreatedConsumer userCreatedConsumer;
    private final ErrandPaymentConsumer errandPaymentConsumer;
    private final ErrandRefundConsumer errandRefundConsumer;

    @SqsListener(value = "${events.messaging.queue-name}", acknowledgementMode = "ON_SUCCESS")
    public void consume(@Header("eventType") String eventType, String body) {
        switch (eventType) {
            case UserCreatedEvent.TYPE -> {
                var event = readValidatedEvent(body, UserCreatedEvent.class);
                userCreatedConsumer.initializeAccount(event);
            }
            case ErrandCancelledEvent.TYPE -> {
                var event = readValidatedEvent(body, ErrandCancelledEvent.class);
                errandRefundConsumer.releaseReservedCredits(event);
            }
            case ErrandExpiredEvent.TYPE -> {
                var event = readValidatedEvent(body, ErrandExpiredEvent.class);
                errandRefundConsumer.releaseReservedCredits(event);
            }
            case ErrandCompletedEvent.TYPE -> {
                var event = readValidatedEvent(body, ErrandCompletedEvent.class);
                errandPaymentConsumer.transferReservedCredits(event);
            }
            default -> throw new IllegalArgumentException("Unexpected event type: " + eventType);
        }
    }

    private <T> T readValidatedEvent(String body, Class<T> eventType) {
        var event = objectMapper.readValue(body, eventType);
        eventValidator.validateEvent(event);

        return event;
    }
}
