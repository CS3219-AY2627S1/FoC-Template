package sg.edu.nus.foc.order.application;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
import static org.mockito.ArgumentMatchers.*;

import com.google.api.core.ApiFutures;
import com.google.cloud.pubsub.v1.Publisher;
import com.google.pubsub.v1.PubsubMessage;
import java.time.Duration;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import sg.edu.nus.foc.order.adapter.PubSubCreditCompensationPublisher;
import sg.edu.nus.foc.order.application.recovery.CreditCompensationRequest;
import sg.edu.nus.foc.order.config.CompensationTransportSettings;
import sg.edu.nus.foc.order.messagingpublisher.publisher.EventPublicationException;
import sg.edu.nus.foc.order.messagingpublisher.publisher.PubSubPublisherFactory;
import tools.jackson.databind.json.JsonMapper;

class CompensationPublisherTest {
    @Test void exactMinimalRequestAndAttributesArePublishedAndFailuresRemainVisible() {
        PubSubPublisherFactory factory = mock(PubSubPublisherFactory.class);
        Publisher publisher = mock(Publisher.class);
        when(factory.forTopic("demo-local", "requests")).thenReturn(publisher);
        when(publisher.publish(any(PubsubMessage.class))).thenReturn(ApiFutures.immediateFuture("broker-id"));
        CompensationTransportSettings settings = new CompensationTransportSettings("requests", "results",
                "emulator", "", "", "demo-local", "emulator", "localhost:8085",
                "local", "demo-auth", "localhost:9099");
        PubSubCreditCompensationPublisher adapter = new PubSubCreditCompensationPublisher(factory,
                JsonMapper.builder().build(), settings, Duration.ofSeconds(1));
        CreditCompensationRequest event = new CreditCompensationRequest("C", "K", "CLEAR_COURIER", "O", "actor", 2, null);
        adapter.publish(event);
        ArgumentCaptor<PubsubMessage> captured = ArgumentCaptor.forClass(PubsubMessage.class);
        verify(publisher).publish(captured.capture());
        assertEquals("CreditCompensationRequested", captured.getValue().getAttributesOrThrow("eventType"));
        assertEquals("1", captured.getValue().getAttributesOrThrow("eventVersion"));
        assertEquals("C", captured.getValue().getAttributesOrThrow("eventId"));
        assertEquals(event, JsonMapper.builder().build().readValue(
                captured.getValue().getData().toStringUtf8(), CreditCompensationRequest.class));
        when(publisher.publish(any(PubsubMessage.class))).thenReturn(ApiFutures.immediateFailedFuture(new IllegalStateException("offline")));
        assertThrows(EventPublicationException.class, () -> adapter.publish(event));
        assertThrows(IllegalArgumentException.class, () -> new PubSubCreditCompensationPublisher(
                factory, JsonMapper.builder().build(), settings, Duration.ZERO));
    }
}
