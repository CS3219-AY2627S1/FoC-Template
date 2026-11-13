package com.cs3219.foc.user.infrastructure.messaging.producer;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

import com.cs3219.foc.user.config.EventMessagingProperties;
import com.cs3219.foc.user.model.dto.event.UserCreatedEvent;
import io.awspring.cloud.sns.core.SnsNotification;
import io.awspring.cloud.sns.core.SnsOperations;
import java.time.OffsetDateTime;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.messaging.MessagingException;

class SnsUserCreatedEventPublisherTests {
    private static final String TOPIC = "arn:aws:sns:ap-southeast-1:000000000000:foc-dev-user-events";
    private final SnsOperations sns = mock(SnsOperations.class);
    private final UserCreatedEvent event = new UserCreatedEvent(
            UUID.randomUUID(), 1, OffsetDateTime.now(), new UserCreatedEvent.Payload(UUID.randomUUID()));
    private final SnsUserCreatedEventPublisher publisher =
            new SnsUserCreatedEventPublisher(sns, new EventMessagingProperties(TOPIC));

    @Test
    void publishesEventTypeAndEventId() {
        publisher.publish(event);
        ArgumentCaptor<SnsNotification<UserCreatedEvent>> notification = ArgumentCaptor.captor();
        verify(sns).sendNotification(eq(TOPIC), notification.capture());
        var sent = notification.getValue();
        var eventId = event.eventId().toString();
        assertThat(sent.getPayload()).isEqualTo(event);
        assertThat(sent.getHeaders())
                .containsEntry("eventType", UserCreatedEvent.TYPE)
                .containsEntry("eventId", eventId);
    }

    @Test
    void publishFailurePropagates() {
        doThrow(new MessagingException("sns down")).when(sns).sendNotification(any(), any());
        assertThatThrownBy(() -> publisher.publish(event)).isInstanceOf(MessagingException.class);
    }
}
