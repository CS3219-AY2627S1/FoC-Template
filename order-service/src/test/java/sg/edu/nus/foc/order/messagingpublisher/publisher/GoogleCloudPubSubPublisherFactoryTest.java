package sg.edu.nus.foc.order.messagingpublisher.publisher;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotSame;
import static org.junit.jupiter.api.Assertions.assertSame;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;

import com.google.cloud.pubsub.v1.Publisher;
import com.google.pubsub.v1.ProjectTopicName;

import java.util.ArrayList;
import java.util.List;

import org.junit.jupiter.api.Test;

class GoogleCloudPubSubPublisherFactoryTest {
    @Test
    void emulatorConfigurationFailsClosedOutsideLocalDemoEnvironment() {
        org.junit.jupiter.api.Assertions.assertThrows(IllegalArgumentException.class,
                () -> new GoogleCloudPubSubPublisherFactory("emulator", "localhost:8085", "staging"));
        org.junit.jupiter.api.Assertions.assertThrows(IllegalArgumentException.class,
                () -> new GoogleCloudPubSubPublisherFactory("cloud", "localhost:8085", "production"));
        org.junit.jupiter.api.Assertions.assertThrows(IllegalArgumentException.class,
                () -> new GoogleCloudPubSubPublisherFactory("emulator", "", "local"));
        GoogleCloudPubSubPublisherFactory factory = new GoogleCloudPubSubPublisherFactory(
                "emulator", "localhost:8085", "local");
        org.junit.jupiter.api.Assertions.assertThrows(IllegalArgumentException.class,
                () -> factory.forTopic("protean-vigil-509704-q4", "order-completion-prod-v1"));
        factory.close();
    }

    @Test
    void reusesPublisherByTopicAndClosesIt() {
        List<ProjectTopicName> createdTopics = new ArrayList<>();
        List<Publisher> createdPublishers = new ArrayList<>();
        GoogleCloudPubSubPublisherFactory factory = new GoogleCloudPubSubPublisherFactory(topicName -> {
            createdTopics.add(topicName);
            Publisher publisher = mock(Publisher.class);
            createdPublishers.add(publisher);
            return publisher;
        });

        Publisher first = factory.forTopic("foc-project", "order-completion-dev-v1");
        Publisher second = factory.forTopic("foc-project", "order-completion-dev-v1");
        Publisher anotherTopic = factory.forTopic("foc-project", "open-order-refund-dev-v1");

        assertSame(first, second);
        assertNotSame(first, anotherTopic);
        assertEquals(2, createdTopics.size());
        assertEquals(ProjectTopicName.of("foc-project", "order-completion-dev-v1"), createdTopics.get(0));
        factory.close();
        createdPublishers.forEach(publisher -> verify(publisher).shutdown());
    }
}
