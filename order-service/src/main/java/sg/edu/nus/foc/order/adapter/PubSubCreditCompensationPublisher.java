package sg.edu.nus.foc.order.adapter;

import com.google.protobuf.ByteString;
import com.google.pubsub.v1.PubsubMessage;
import java.time.Duration;
import java.util.concurrent.TimeUnit;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;
import sg.edu.nus.foc.order.application.recovery.CreditCompensationPublisher;
import sg.edu.nus.foc.order.application.recovery.CreditCompensationRequest;
import sg.edu.nus.foc.order.config.CompensationTransportSettings;
import sg.edu.nus.foc.order.messagingpublisher.publisher.EventPublicationException;
import sg.edu.nus.foc.order.messagingpublisher.publisher.PubSubPublisherFactory;
import tools.jackson.databind.json.JsonMapper;

@Component
@ConditionalOnProperty(name = "order.commands.compensation.enabled", havingValue = "true")
public class PubSubCreditCompensationPublisher implements CreditCompensationPublisher {
    private final PubSubPublisherFactory publishers;
    private final JsonMapper json;
    private final CompensationTransportSettings settings;
    private final Duration timeout;
    public PubSubCreditCompensationPublisher(PubSubPublisherFactory publishers, JsonMapper json,
            CompensationTransportSettings settings,
            @Value("${order.messaging.publish-timeout:10s}") Duration timeout) {
        this.publishers = publishers; this.json = json; this.settings = settings; this.timeout = timeout;
        if (timeout.isNegative() || timeout.isZero()) throw new IllegalArgumentException("Positive publish timeout required.");
    }
    @Override public void publish(CreditCompensationRequest event) {
        try {
            PubsubMessage message = PubsubMessage.newBuilder()
                    .setData(ByteString.copyFrom(json.writeValueAsBytes(event)))
                    .putAttributes("eventType", "CreditCompensationRequested")
                    .putAttributes("eventVersion", "1").putAttributes("eventId", event.eventId()).build();
            publishers.forTopic(settings.projectId(), settings.requestTopic()).publish(message)
                    .get(timeout.toMillis(), TimeUnit.MILLISECONDS);
        } catch (InterruptedException interrupted) {
            Thread.currentThread().interrupt();
            throw new EventPublicationException("Compensation publication interrupted.", interrupted);
        } catch (Exception failure) {
            throw new EventPublicationException("Pub/Sub did not confirm compensation publication.", failure);
        }
    }
}
