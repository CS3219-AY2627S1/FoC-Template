/*
 * AI Assistance Disclosure:
 * Tool: OpenAI Codex (GPT-5), date: 2026-10-27
 * Mode: Code generation and implementation assistance.
 * Scope: Generated the Credit compensation workflow implementation from the approved cross-service contract.
 * Author review: I reviewed for correctness
 */
package sg.edu.nus.foc.credit.messaging;

import com.google.api.gax.core.NoCredentialsProvider;
import com.google.api.gax.grpc.GrpcTransportChannel;
import com.google.api.gax.rpc.FixedTransportChannelProvider;
import com.google.cloud.pubsub.v1.Publisher;
import com.google.pubsub.v1.ProjectTopicName;
import io.grpc.ManagedChannel;
import io.grpc.ManagedChannelBuilder;
import jakarta.annotation.PreDestroy;
import java.io.IOException;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.TimeUnit;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import sg.edu.nus.foc.credit.config.CreditCompensationProperties;

@Component
class CreditPubSubPublisherFactory {

    private static final Logger log = LoggerFactory.getLogger(CreditPubSubPublisherFactory.class);
    private final Map<String, Publisher> publishers = new ConcurrentHashMap<>();
    private final CreditCompensationProperties.Mode mode;
    private final ManagedChannel emulatorChannel;

    CreditPubSubPublisherFactory(CreditCompensationProperties properties,
                                 @Value("${PUBSUB_EMULATOR_HOST:}") String emulatorHost,
                                 @Value("${FOC_ENVIRONMENT:local}") String environment) {
        mode = properties.messagingMode();
        if (mode == CreditCompensationProperties.Mode.EMULATOR) {
            if (!"local".equals(environment) || emulatorHost.isBlank()
                    || !properties.projectId().startsWith("demo-")) {
                throw new IllegalStateException(
                        "Credit Pub/Sub emulator requires local environment, host, and demo project.");
            }
            emulatorChannel = ManagedChannelBuilder.forTarget(emulatorHost).usePlaintext().build();
        } else {
            if (mode == CreditCompensationProperties.Mode.GOOGLE && !emulatorHost.isBlank()) {
                throw new IllegalStateException("Google Credit messaging must not receive emulator settings.");
            }
            emulatorChannel = null;
        }
    }

    Publisher forTopic(String projectId, String topicId) {
        if (mode == CreditCompensationProperties.Mode.DISABLED) {
            throw new IllegalStateException("Credit compensation result publication is disabled.");
        }
        String key = projectId + "/" + topicId;
        return publishers.computeIfAbsent(key, ignored -> create(ProjectTopicName.of(projectId, topicId)));
    }

    private Publisher create(ProjectTopicName topic) {
        try {
            Publisher.Builder builder = Publisher.newBuilder(topic);
            if (emulatorChannel != null) {
                builder.setChannelProvider(FixedTransportChannelProvider.create(
                                GrpcTransportChannel.create(emulatorChannel)))
                        .setCredentialsProvider(NoCredentialsProvider.create());
            }
            return builder.build();
        } catch (IOException exception) {
            throw new IllegalStateException("Could not create Credit Pub/Sub publisher.", exception);
        }
    }

    @PreDestroy
    void close() {
        publishers.values().forEach(Publisher::shutdown);
        publishers.values().forEach(publisher -> {
            try {
                publisher.awaitTermination(10, TimeUnit.SECONDS);
            } catch (InterruptedException exception) {
                Thread.currentThread().interrupt();
                log.warn("Interrupted while closing Credit Pub/Sub publisher.");
            }
        });
        if (emulatorChannel != null) emulatorChannel.shutdownNow();
    }
}
