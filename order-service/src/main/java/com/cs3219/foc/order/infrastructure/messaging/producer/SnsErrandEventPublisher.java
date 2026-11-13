package com.cs3219.foc.order.infrastructure.messaging.producer;

import com.cs3219.foc.order.config.EventMessagingProperties;
import com.cs3219.foc.order.model.dto.event.ErrandCancelledEvent;
import com.cs3219.foc.order.model.dto.event.ErrandChatReadEvent;
import com.cs3219.foc.order.model.dto.event.ErrandCompletedEvent;
import com.cs3219.foc.order.model.dto.event.ErrandExpiredEvent;
import com.cs3219.foc.order.model.dto.event.ErrandMessagePostedEvent;
import io.awspring.cloud.sns.core.SnsNotification;
import io.awspring.cloud.sns.core.SnsOperations;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.modulith.events.ApplicationModuleListener;
import org.springframework.stereotype.Component;

@Component
@RequiredArgsConstructor
public class SnsErrandEventPublisher {
    private final SnsOperations snsOperations;
    private final EventMessagingProperties messagingProperties;

    @ApplicationModuleListener(id = "order-completed")
    public void publish(ErrandCompletedEvent event) {
        send(event, ErrandCompletedEvent.TYPE, event.eventId());
    }

    @ApplicationModuleListener(id = "order-cancelled")
    public void publish(ErrandCancelledEvent event) {
        send(event, ErrandCancelledEvent.TYPE, event.eventId());
    }

    @ApplicationModuleListener(id = "order-expired")
    public void publish(ErrandExpiredEvent event) {
        send(event, ErrandExpiredEvent.TYPE, event.eventId());
    }

    @ApplicationModuleListener(id = "order-message-posted")
    public void publish(ErrandMessagePostedEvent event) {
        send(event, ErrandMessagePostedEvent.TYPE, event.eventId());
    }

    @ApplicationModuleListener(id = "order-chat-read")
    public void publish(ErrandChatReadEvent event) {
        send(event, ErrandChatReadEvent.TYPE, event.eventId());
    }

    private void send(Object event, String type, UUID eventId) {
        snsOperations.sendNotification(
                messagingProperties.topicArn(),
                SnsNotification.builder(event)
                        .header("eventType", type)
                        .header("eventId", eventId.toString())
                        .build());
    }
}
