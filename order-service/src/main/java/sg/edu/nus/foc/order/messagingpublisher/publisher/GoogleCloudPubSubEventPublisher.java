package sg.edu.nus.foc.order.messagingpublisher.publisher;

import com.google.api.core.ApiFuture;
import com.google.cloud.pubsub.v1.Publisher;
import com.google.protobuf.ByteString;
import com.google.pubsub.v1.PubsubMessage;
import java.time.Duration;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import tools.jackson.databind.json.JsonMapper;
import sg.edu.nus.foc.order.messagingpublisher.dto.OrderTaskEvent;
import sg.edu.nus.foc.order.messagingpublisher.interfaces.IEventPublisher;

@Component
public class GoogleCloudPubSubEventPublisher implements IEventPublisher<Object> {
    private final PubSubPublisherFactory publisherFactory;
    private final JsonMapper objectMapper;
    private final String projectId;
    private final Duration publishTimeout;

    public GoogleCloudPubSubEventPublisher(
            PubSubPublisherFactory publisherFactory,
            JsonMapper objectMapper,
            @Value("${order.messaging.project-id:local-project}") String projectId,
            @Value("${order.messaging.publish-timeout:10s}") Duration publishTimeout) {
        this.publisherFactory = publisherFactory;
        this.objectMapper = objectMapper;
        this.projectId = projectId;
        this.publishTimeout = publishTimeout;
    }

    @Override
    public String publish(String topicId, Object event) {
        validate(topicId, event);
        OrderTaskEvent orderTaskEvent = (OrderTaskEvent) event;
        try {
            byte[] eventJson = objectMapper.writeValueAsBytes(event);
            PubsubMessage.Builder messageBuilder = PubsubMessage.newBuilder()
                    .setData(ByteString.copyFrom(eventJson))
                    .putAttributes("eventType", orderTaskEvent.getEventType())
                    .putAttributes("eventId", orderTaskEvent.getEventId())
                    .putAttributes("eventVersion", Integer.toString(orderTaskEvent.getEventVersion()));
            if (event instanceof sg.edu.nus.foc.order.messagingpublisher.dto.PenaltyScoreAdditionEvent penalty && penalty.getCourierSequence() != null) {
                messageBuilder.setOrderingKey(penalty.getCourierId());
            } else if (event instanceof sg.edu.nus.foc.order.messagingpublisher.dto.PenaltyScoreDeductionEvent penalty && penalty.getCourierSequence() != null) {
                messageBuilder.setOrderingKey(penalty.getCourierId());
            }
            PubsubMessage message = messageBuilder.build();
            Publisher publisher = publisherFactory.forTopic(projectId, topicId);
            // The SDK pauses an ordering key on publication errors. The durable outbox
            // retries it; User's sequence inbox protects against ambiguous/late publishes.
            if (!message.getOrderingKey().isEmpty()) publisher.resumePublish(message.getOrderingKey());
            ApiFuture<String> messageId = publisher.publish(message);
            return messageId.get(publishTimeout.toMillis(), TimeUnit.MILLISECONDS);
        } catch (ExecutionException | TimeoutException exception) {
            throw new EventPublicationException("Google Pub/Sub did not confirm the order event.", exception);
        } catch (InterruptedException exception) {
            Thread.currentThread().interrupt();
            throw new EventPublicationException("Interrupted while waiting for Google Pub/Sub confirmation.", exception);
        } catch (RuntimeException exception) {
            if (exception instanceof EventPublicationException publicationException) {
                throw publicationException;
            }
            throw new EventPublicationException("Could not publish the order event to Google Pub/Sub.", exception);
        }
    }

    private void validate(String topicId, Object event) {
        if (topicId == null || topicId.isBlank() || "TODO_TOPIC".equals(topicId)) {
            throw new EventPublicationException("The Google Pub/Sub topic placeholder must be configured.");
        }
        if (!(event instanceof OrderTaskEvent)) {
            throw new EventPublicationException("Only typed Order task events may be published.");
        }
    }
}
