
package sg.edu.nus.foc.user.messagingpublisher;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.google.api.core.ApiFutures;
import com.google.cloud.pubsub.v1.Publisher;
import com.google.pubsub.v1.PubsubMessage;

import java.util.concurrent.ExecutionException;

import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

class UserCreatedPublisherTest {

    @Test
    void publishesUserCreatedMessageWithExpectedAttributes()
            throws Exception {

        Publisher publisher = mock(Publisher.class);

        when(publisher.publish(any(PubsubMessage.class)))
                .thenReturn(ApiFutures.immediateFuture("message-123"));

        UserCreatedPublisher eventPublisher =
                new UserCreatedPublisher(publisher);

        String eventId = "event-123";
        String payload =
                "{\"eventId\":\"event-123\",\"userId\":\"user-456\"}";

        eventPublisher.publish(eventId, payload);

        ArgumentCaptor<PubsubMessage> captor =
                ArgumentCaptor.forClass(PubsubMessage.class);

        verify(publisher).publish(captor.capture());

        PubsubMessage message = captor.getValue();

        assertEquals(
                "event-123",
                message.getAttributesOrThrow("eventId"));

        assertEquals(
                "UserCreated",
                message.getAttributesOrThrow("eventType"));

        assertEquals(
                "1",
                message.getAttributesOrThrow("eventVersion"));

        assertEquals(
                payload,
                message.getData().toStringUtf8());
    }

    @Test
    void propagatesFailureWhenPubSubPublishFails() {

        Publisher publisher = mock(Publisher.class);

        when(publisher.publish(any(PubsubMessage.class)))
                .thenReturn(ApiFutures.immediateFailedFuture(
                        new IllegalStateException("unavailable")));

        UserCreatedPublisher eventPublisher =
                new UserCreatedPublisher(publisher);

        assertThrows(
                ExecutionException.class,
                () -> eventPublisher.publish(
                        "event-123",
                        "{\"eventId\":\"event-123\"}"));
    }
}
