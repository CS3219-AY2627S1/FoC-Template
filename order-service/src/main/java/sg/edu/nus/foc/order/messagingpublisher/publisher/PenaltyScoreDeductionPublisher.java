package sg.edu.nus.foc.order.messagingpublisher.publisher;

import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import sg.edu.nus.foc.order.messagingpublisher.dto.PenaltyScoreDeductionEvent;
import sg.edu.nus.foc.order.messagingpublisher.interfaces.IEventPublisher;
import sg.edu.nus.foc.order.messagingpublisher.interfaces.IPenaltyScoreDeductionPublisher;

@Component
@RequiredArgsConstructor
public class PenaltyScoreDeductionPublisher implements IPenaltyScoreDeductionPublisher {

    private final IEventPublisher<Object> eventPublisher;

    @Value("${order.messaging.topics.courier-penalty-deduction:TODO_TOPIC}")
    private String topicId = "TODO_TOPIC";
    @Value("${order.messaging.topics.courier-penalty-event:TODO_TOPIC}")
    private String sequencedTopicId = "TODO_TOPIC";

    @Override
    public void publishPenaltyScoreDeduction(PenaltyScoreDeductionEvent event) {
        eventPublisher.publish(event.getCourierSequence() == null ? topicId : sequencedTopicId, event);
    }
}
