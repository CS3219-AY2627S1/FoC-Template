package com.cs3219.foc.supplier.infrastructure.messaging.producer;

import com.cs3219.foc.supplier.config.EventMessagingProperties;
import com.cs3219.foc.supplier.model.dto.event.SupplierChangedEvent;
import io.awspring.cloud.sns.core.SnsNotification;
import io.awspring.cloud.sns.core.SnsOperations;
import lombok.RequiredArgsConstructor;
import org.springframework.modulith.events.ApplicationModuleListener;
import org.springframework.stereotype.Component;

@Component
@RequiredArgsConstructor
public class SupplierChangedEventPublisher {
    private final SnsOperations snsOperations;
    private final EventMessagingProperties messagingProperties;

    @ApplicationModuleListener(id = "supplier-changed")
    public void publish(SupplierChangedEvent event) {
        var notification = SnsNotification.builder(event)
                .header("eventType", "SupplierChangedEvent")
                .header("eventId", event.eventId().toString())
                .build();
        snsOperations.sendNotification(messagingProperties.topicArn(), notification);
    }
}
