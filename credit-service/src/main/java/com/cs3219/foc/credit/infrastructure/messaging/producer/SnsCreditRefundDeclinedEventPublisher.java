package com.cs3219.foc.credit.infrastructure.messaging.producer;

import com.cs3219.foc.credit.config.EventMessagingProperties;
import com.cs3219.foc.credit.model.dto.event.CreditRefundDeclinedEvent;
import io.awspring.cloud.sns.core.SnsNotification;
import io.awspring.cloud.sns.core.SnsOperations;
import lombok.RequiredArgsConstructor;
import org.springframework.modulith.events.ApplicationModuleListener;
import org.springframework.stereotype.Component;

@Component
@RequiredArgsConstructor
public class SnsCreditRefundDeclinedEventPublisher {
    private final SnsOperations snsOperations;
    private final EventMessagingProperties messagingProperties;

    @ApplicationModuleListener(id = "credit-refund-declined")
    public void publish(CreditRefundDeclinedEvent event) {
        var topicArn = messagingProperties.topicArn();
        var eventType = CreditRefundDeclinedEvent.TYPE;
        var eventId = event.eventId().toString();
        var notification = SnsNotification.builder(event)
                .header("eventType", eventType)
                .header("eventId", eventId)
                .build();
        snsOperations.sendNotification(topicArn, notification);
    }
}
