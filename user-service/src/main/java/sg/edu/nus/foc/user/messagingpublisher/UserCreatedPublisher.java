/*
 * AI Assistance Disclosure:
 * Tool: OpenAI Codex (GPT-5), date: 2026-10-25
 * Mode: Code generation.
 * Scope: Generated the initial code and user-created publishing structure.
 * Author review: I reviewed for correctness.
 */
package sg.edu.nus.foc.user.messagingpublisher;

import com.google.api.core.ApiFuture;
import com.google.api.gax.core.NoCredentialsProvider;
import com.google.api.gax.grpc.GrpcTransportChannel;
import com.google.api.gax.rpc.FixedTransportChannelProvider;
import com.google.cloud.pubsub.v1.Publisher;
import com.google.protobuf.ByteString;
import com.google.pubsub.v1.PubsubMessage;
import com.google.pubsub.v1.TopicName;

import io.grpc.ManagedChannel;
import io.grpc.ManagedChannelBuilder;
import jakarta.annotation.PreDestroy;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.TimeUnit;

@Component
public class UserCreatedPublisher {

    private final Publisher publisher;
    private final ManagedChannel emulatorChannel;

    @Autowired
    public UserCreatedPublisher(
            @Value("${user.messaging.project-id}") String projectId,
            @Value("${user.messaging.topics.user-created}") String topicName,
            @Value("${user.messaging.mode:cloud}") String mode,
            @Value("${user.messaging.emulator-host:}") String emulatorHost)
            throws IOException {

        TopicName topic = TopicName.of(projectId, topicName);

        if ("emulator".equalsIgnoreCase(mode)) {
            if (emulatorHost == null || emulatorHost.isBlank()) {
                throw new IllegalArgumentException(
                        "PUBSUB_EMULATOR_HOST must be set in emulator mode.");
            }

            this.emulatorChannel = ManagedChannelBuilder
                    .forTarget(emulatorHost)
                    .usePlaintext()
                    .build();

            this.publisher = Publisher.newBuilder(topic)
                    .setChannelProvider(
                            FixedTransportChannelProvider.create(
                                    GrpcTransportChannel.create(
                                            emulatorChannel)))
                    .setCredentialsProvider(
                            NoCredentialsProvider.create())
                    .build();

        } else if ("cloud".equalsIgnoreCase(mode)) {
            this.emulatorChannel = null;
            this.publisher = Publisher.newBuilder(topic).build();

        } else {
            throw new IllegalArgumentException(
                    "Unsupported USER_MESSAGING_MODE: " + mode);
        }
    }

    // Package-private constructor for unit tests.
    UserCreatedPublisher(Publisher publisher) {
        this.publisher = publisher;
        this.emulatorChannel = null;
    }

    public void publish(String eventId, String payload)
            throws ExecutionException, InterruptedException {

        PubsubMessage message = PubsubMessage.newBuilder()
                .setData(ByteString.copyFromUtf8(payload))
                .putAttributes("eventId", eventId)
                .putAttributes("eventType", "UserCreated")
                .putAttributes("eventVersion", "1")
                .build();

        ApiFuture<String> future = publisher.publish(message);
        future.get();
    }

    @PreDestroy
    public void close() throws InterruptedException {
        publisher.shutdown();

        try {
            publisher.awaitTermination(30, TimeUnit.SECONDS);
        } finally {
            if (emulatorChannel != null) {
                emulatorChannel.shutdown();
                emulatorChannel.awaitTermination(10, TimeUnit.SECONDS);
            }
        }
    }
}
