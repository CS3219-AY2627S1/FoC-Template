package sg.edu.nus.foc.order.messagingpublisher.publisher;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.google.api.core.ApiFuture;
import com.google.api.core.ApiFutures;
import com.google.cloud.pubsub.v1.Publisher;
import com.google.pubsub.v1.PubsubMessage;
import java.time.Duration;
import java.time.Instant;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import sg.edu.nus.foc.order.messagingpublisher.dto.OrderCompletionTaskEvent;
import tools.jackson.databind.json.JsonMapper;

class GoogleCloudPubSubEventPublisherTest {
    private static final String PROJECT_ID = "order-local";
    private static final String TOPIC_ID = "order-completion";

    @Test void sequencedPenaltyCarriesCourierOrderingKeyAndResumesRetryableKey() {
        var factory=mock(PubSubPublisherFactory.class);var publisher=mock(Publisher.class);
        when(factory.forTopic(PROJECT_ID,"courier-penalty-event")).thenReturn(publisher);
        when(publisher.publish(any(PubsubMessage.class))).thenReturn(ApiFutures.immediateFuture("broker-id"));
        var transport=new GoogleCloudPubSubEventPublisher(factory,JsonMapper.builder().build(),PROJECT_ID,Duration.ofSeconds(2));
        var event=new sg.edu.nus.foc.order.messagingpublisher.dto.PenaltyScoreAdditionEvent();
        event.setEventId("event");event.setEventType("PenaltyScoreAdditionEvent");event.setEventVersion(2);
        event.setCourierId("courier");event.setCourierSequence(42L);
        transport.publish("courier-penalty-event",event);
        var sent=ArgumentCaptor.forClass(PubsubMessage.class);verify(publisher).publish(sent.capture());
        assertEquals("courier",sent.getValue().getOrderingKey());
        assertEquals(42,JsonMapper.builder().build().readTree(sent.getValue().getData().toStringUtf8()).get("courierSequence").asLong());
        verify(publisher).resumePublish("courier");
    }

    @Test
    void waitsForPubSubMessageIdAndPublishesTypedAttributes() {
        PubSubPublisherFactory publisherFactory = mock(PubSubPublisherFactory.class);
        Publisher publisher = mock(Publisher.class);
        when(publisherFactory.forTopic(PROJECT_ID, TOPIC_ID)).thenReturn(publisher);
        when(publisher.publish(any(PubsubMessage.class))).thenReturn(ApiFutures.immediateFuture("message-123"));
        GoogleCloudPubSubEventPublisher eventPublisher = new GoogleCloudPubSubEventPublisher(
                publisherFactory,
                JsonMapper.builder().findAndAddModules().build(),
                PROJECT_ID,
                Duration.ofSeconds(2));

        String messageId = eventPublisher.publish(TOPIC_ID, completionEvent());

        assertEquals("message-123", messageId);
        ArgumentCaptor<PubsubMessage> sent = ArgumentCaptor.forClass(PubsubMessage.class);
        verify(publisher).publish(sent.capture());
        tools.jackson.databind.JsonNode body = JsonMapper.builder().build()
                .readTree(sent.getValue().getData().toStringUtf8());
        java.util.Set<String> fields = new java.util.HashSet<>();
        body.propertyNames().forEach(fields::add);
        assertEquals(java.util.Set.of("eventId", "eventType", "orderId", "orderStatus",
                "creditAmount", "occurredAt", "courierId"), fields);
        assertEquals("2", sent.getValue().getAttributesOrThrow("eventVersion"));
        assertEquals("event-123", sent.getValue().getAttributesOrThrow("eventId"));
    }

    @Test
    void reportsFailureWhenPubSubDoesNotAcknowledgePublish() {
        PubSubPublisherFactory publisherFactory = mock(PubSubPublisherFactory.class);
        Publisher publisher = mock(Publisher.class);
        when(publisherFactory.forTopic(PROJECT_ID, TOPIC_ID)).thenReturn(publisher);
        when(publisher.publish(any(PubsubMessage.class)))
                .thenReturn(ApiFutures.immediateFailedFuture(new IllegalStateException("unavailable")));
        GoogleCloudPubSubEventPublisher eventPublisher = new GoogleCloudPubSubEventPublisher(
                publisherFactory,
                JsonMapper.builder().findAndAddModules().build(),
                PROJECT_ID,
                Duration.ofSeconds(2));

        assertThrows(EventPublicationException.class, () -> eventPublisher.publish(TOPIC_ID, completionEvent()));
    }

    @Test
    void doesNotTreatTheTopicPlaceholderAsAValidPublishTarget() {
        PubSubPublisherFactory publisherFactory = mock(PubSubPublisherFactory.class);
        GoogleCloudPubSubEventPublisher eventPublisher = new GoogleCloudPubSubEventPublisher(
                publisherFactory,
                JsonMapper.builder().findAndAddModules().build(),
                PROJECT_ID,
                Duration.ofSeconds(2));

        assertThrows(
                EventPublicationException.class,
                () -> eventPublisher.publish("TODO_TOPIC", completionEvent()));
        assertThrows(EventPublicationException.class, () -> eventPublisher.publish(null, completionEvent()));
        assertThrows(EventPublicationException.class, () -> eventPublisher.publish(" ", completionEvent()));
        assertThrows(EventPublicationException.class, () -> eventPublisher.publish(TOPIC_ID, new Object()));
        verify(publisherFactory, never()).forTopic(any(), any());
    }

    @Test
    void mapsJsonSerializationFailureToPublicationFailure() throws Exception {
        PubSubPublisherFactory publisherFactory = mock(PubSubPublisherFactory.class);
        JsonMapper objectMapper = mock(JsonMapper.class);
        when(objectMapper.writeValueAsBytes(any()))
                .thenThrow(new IllegalStateException("serialization failed"));
        GoogleCloudPubSubEventPublisher eventPublisher = new GoogleCloudPubSubEventPublisher(
                publisherFactory,
                objectMapper,
                PROJECT_ID,
                Duration.ofSeconds(2));

        assertThrows(EventPublicationException.class, () -> eventPublisher.publish(TOPIC_ID, completionEvent()));
        verify(publisherFactory, never()).forTopic(any(), any());
    }

    @Test
    void restoresThreadInterruptWhenPubSubWaitIsInterrupted() throws Exception {
        PubSubPublisherFactory publisherFactory = mock(PubSubPublisherFactory.class);
        Publisher publisher = mock(Publisher.class);
        ApiFuture<String> messageId = mock(ApiFuture.class);
        when(publisherFactory.forTopic(PROJECT_ID, TOPIC_ID)).thenReturn(publisher);
        when(publisher.publish(any(PubsubMessage.class))).thenReturn(messageId);
        when(messageId.get(2000L, TimeUnit.MILLISECONDS)).thenThrow(new InterruptedException("interrupted"));
        GoogleCloudPubSubEventPublisher eventPublisher = new GoogleCloudPubSubEventPublisher(
                publisherFactory,
                JsonMapper.builder().findAndAddModules().build(),
                PROJECT_ID,
                Duration.ofSeconds(2));

        try {
            assertThrows(EventPublicationException.class, () -> eventPublisher.publish(TOPIC_ID, completionEvent()));
            org.junit.jupiter.api.Assertions.assertTrue(Thread.currentThread().isInterrupted());
        } finally {
            Thread.interrupted();
        }
    }

    private OrderCompletionTaskEvent completionEvent() {
        OrderCompletionTaskEvent event = new OrderCompletionTaskEvent();
        event.setEventId("event-123");
        event.setEventType("OrderCompletionTaskEvent");
        event.setEventVersion(2);
        event.setOrderVersion(4L);
        event.setOccurredAt(Instant.parse("2026-10-02T10:00:00Z"));
        return event;
    }
}
