package sg.edu.nus.foc.order.messagingpublisher.publisher;

import com.google.cloud.pubsub.v1.Publisher;
import com.google.pubsub.v1.ProjectTopicName;
import com.google.api.gax.core.NoCredentialsProvider;
import com.google.api.gax.grpc.GrpcTransportChannel;
import com.google.api.gax.rpc.FixedTransportChannelProvider;
import io.grpc.ManagedChannel;
import io.grpc.ManagedChannelBuilder;
import jakarta.annotation.PreDestroy;

import java.io.IOException;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.TimeUnit;
import java.util.function.Function;

import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;

@Component
@Slf4j
public class GoogleCloudPubSubPublisherFactory implements PubSubPublisherFactory {
    @Value("${ORDER_PUBSUB_PUBLISH_ENDPOINT:asia-southeast1-pubsub.googleapis.com:443}")
    private String publishEndpoint = "asia-southeast1-pubsub.googleapis.com:443";
    private final Function<ProjectTopicName, Publisher> publisherCreator;
    private final ManagedChannel emulatorChannel;

    private final Map<String, Publisher> publishers = new ConcurrentHashMap<>();

    public GoogleCloudPubSubPublisherFactory() {
        this(GoogleCloudPubSubPublisherFactory::createPublisher);
    }

    @Autowired
    public GoogleCloudPubSubPublisherFactory(
            @Value("${order.messaging.mode:cloud}") String mode,
            @Value("${order.messaging.emulator-host:}") String emulatorHost,
            @Value("${FOC_ENVIRONMENT:local}") String environment) {
        if (!"cloud".equals(mode) && !"emulator".equals(mode)) {
            throw new IllegalArgumentException("Order messaging mode must be cloud or emulator.");
        }
        if ("emulator".equals(mode)) {
            if (!"local".equals(environment) || emulatorHost.isBlank()) {
                throw new IllegalArgumentException("Pub/Sub emulator requires an explicit local host/environment.");
            }
            emulatorChannel = ManagedChannelBuilder.forTarget(emulatorHost).usePlaintext().build();
            publisherCreator = topic -> {
                try {
                    return Publisher.newBuilder(topic)
                            .setEnableMessageOrdering(true)
                            .setChannelProvider(FixedTransportChannelProvider.create(
                                    GrpcTransportChannel.create(emulatorChannel)))
                            .setCredentialsProvider(NoCredentialsProvider.create()).build();
                } catch (IOException exception) {
                    throw new EventPublicationException("Could not create a local Pub/Sub publisher.", exception);
                }
            };
        } else {
            if (!emulatorHost.isBlank()) {
                throw new IllegalArgumentException("Cloud Pub/Sub must not receive emulator settings.");
            }
            emulatorChannel = null;
            publisherCreator = topic -> createPublisher(topic, publishEndpoint);
        }
    }

    GoogleCloudPubSubPublisherFactory(Function<ProjectTopicName, Publisher> publisherCreator) {
        this.publisherCreator = publisherCreator;
        emulatorChannel = null;
    }

    @Override
    public Publisher forTopic(String projectId, String topicId) {
        if (emulatorChannel != null && !projectId.startsWith("demo-")) {
            throw new IllegalArgumentException("Local Pub/Sub must use a demo project, never a cloud project.");
        }
        String publisherKey = projectId + "/" + topicId;
        ProjectTopicName topicName = ProjectTopicName.of(projectId, topicId);
        return publishers.computeIfAbsent(publisherKey, ignored -> publisherCreator.apply(topicName));
    }

    @PreDestroy
    public void close() {
        publishers.values().forEach(Publisher::shutdown);
        publishers.values().forEach(publisher -> {
            try {
                publisher.awaitTermination(10, TimeUnit.SECONDS);
            } catch (InterruptedException exception) {
                Thread.currentThread().interrupt();
                log.warn("Interrupted while closing a Pub/Sub publisher.");
            }
        });
        if (emulatorChannel != null) emulatorChannel.shutdownNow();
    }

    private static Publisher createPublisher(ProjectTopicName topicName) {
        return createPublisher(topicName, "asia-southeast1-pubsub.googleapis.com:443");
    }

    private static Publisher createPublisher(ProjectTopicName topicName, String endpoint) {
        try {
            return Publisher.newBuilder(topicName).setEnableMessageOrdering(true).setEndpoint(endpoint).build();
        } catch (IOException exception) {
            throw new EventPublicationException("Could not create a Google Pub/Sub publisher.", exception);
        }
    }
}
