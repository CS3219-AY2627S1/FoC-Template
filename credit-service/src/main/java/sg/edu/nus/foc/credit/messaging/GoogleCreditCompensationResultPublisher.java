/*
 * AI Assistance Disclosure:
 * Tool: OpenAI Codex (GPT-5), date: 2026-10-27
 * Mode: Code generation and implementation assistance.
 * Scope: Generated the Credit compensation workflow implementation from the approved cross-service contract.
 * Author review: I reviewed for correctness
 */
package sg.edu.nus.foc.credit.messaging;

import com.google.api.core.ApiFuture;
import com.google.protobuf.ByteString;
import com.google.pubsub.v1.PubsubMessage;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;
import org.springframework.stereotype.Component;
import sg.edu.nus.foc.credit.config.CreditCompensationProperties;
import tools.jackson.databind.json.JsonMapper;

@Component
class GoogleCreditCompensationResultPublisher implements CreditCompensationResultPublisher {

    private final CreditPubSubPublisherFactory publishers;
    private final CreditCompensationProperties properties;
    private final JsonMapper mapper;

    GoogleCreditCompensationResultPublisher(CreditPubSubPublisherFactory publishers,
                                            CreditCompensationProperties properties,
                                            JsonMapper mapper) {
        this.publishers = publishers;
        this.properties = properties;
        this.mapper = mapper;
    }

    @Override
    public String publish(String eventType, int eventVersion, CreditCompensationResult result) {
        try {
            PubsubMessage message = PubsubMessage.newBuilder()
                    .setData(ByteString.copyFrom(mapper.writeValueAsBytes(result)))
                    .putAttributes("eventType", eventType)
                    .putAttributes("eventVersion", Integer.toString(eventVersion))
                    .putAttributes("eventId", result.eventId())
                    .build();
            ApiFuture<String> confirmation = publishers.forTopic(
                    properties.projectId(), properties.resultTopic()).publish(message);
            return confirmation.get(properties.publishTimeout().toMillis(), TimeUnit.MILLISECONDS);
        } catch (ExecutionException | TimeoutException exception) {
            throw new IllegalStateException("Pub/Sub did not confirm the compensation result.", exception);
        } catch (InterruptedException exception) {
            Thread.currentThread().interrupt();
            throw new IllegalStateException("Interrupted while publishing compensation result.", exception);
        }
    }
}
