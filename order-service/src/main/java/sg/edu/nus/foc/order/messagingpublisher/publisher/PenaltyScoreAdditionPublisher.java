package sg.edu.nus.foc.order.messagingpublisher.publisher;

import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import sg.edu.nus.foc.order.messagingpublisher.dto.PenaltyScoreAdditionEvent;
import sg.edu.nus.foc.order.messagingpublisher.interfaces.IEventPublisher;
import sg.edu.nus.foc.order.messagingpublisher.interfaces.IPenaltyScoreAdditionPublisher;

@Component
@RequiredArgsConstructor
public class PenaltyScoreAdditionPublisher implements IPenaltyScoreAdditionPublisher {

    private final IEventPublisher<Object> eventPublisher;

    @Value("${order.messaging.topics.courier-penalty-addition:TODO_TOPIC}")
    private String topicId = "TODO_TOPIC";
    @Value("${order.messaging.topics.courier-penalty-event:TODO_TOPIC}")
    private String sequencedTopicId = "TODO_TOPIC";

    @Override
    public void publishPenaltyScoreAddition(PenaltyScoreAdditionEvent event) {
        eventPublisher.publish(event.getCourierSequence() == null ? topicId : sequencedTopicId, event);
    }
}
