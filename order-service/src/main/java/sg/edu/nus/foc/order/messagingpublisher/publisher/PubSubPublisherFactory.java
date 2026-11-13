package sg.edu.nus.foc.order.messagingpublisher.publisher;

import com.google.cloud.pubsub.v1.Publisher;

public interface PubSubPublisherFactory {
    Publisher forTopic(String projectId, String topicId);
}
