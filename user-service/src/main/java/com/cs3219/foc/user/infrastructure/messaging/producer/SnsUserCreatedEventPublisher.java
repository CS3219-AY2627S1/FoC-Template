package com.cs3219.foc.user.infrastructure.messaging.producer;

import com.cs3219.foc.user.config.EventMessagingProperties;
import com.cs3219.foc.user.model.dto.event.UserCreatedEvent;
import io.awspring.cloud.sns.core.SnsNotification;
import io.awspring.cloud.sns.core.SnsOperations;
import lombok.RequiredArgsConstructor;
import org.springframework.modulith.events.ApplicationModuleListener;
import org.springframework.stereotype.Component;

@Component
@RequiredArgsConstructor
public class SnsUserCreatedEventPublisher {
    private final SnsOperations snsOperations;
    private final EventMessagingProperties messagingProperties;

    @ApplicationModuleListener(id = "user-created")
    public void publish(UserCreatedEvent event) {
        var topicArn = messagingProperties.topicArn();
        var eventType = UserCreatedEvent.TYPE;
        var eventId = event.eventId().toString();
        var notification = SnsNotification.builder(event)
                .header("eventType", eventType)
                .header("eventId", eventId)
                .build();
        snsOperations.sendNotification(topicArn, notification);
    }
}
