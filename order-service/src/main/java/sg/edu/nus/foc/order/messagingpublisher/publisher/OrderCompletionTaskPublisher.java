package sg.edu.nus.foc.order.messagingpublisher.publisher;

import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import sg.edu.nus.foc.order.messagingpublisher.dto.OrderCompletionTaskEvent;
import sg.edu.nus.foc.order.messagingpublisher.interfaces.IEventPublisher;
import sg.edu.nus.foc.order.messagingpublisher.interfaces.IOrderCompletionTaskPublisher;

@Component
@RequiredArgsConstructor
public class OrderCompletionTaskPublisher implements IOrderCompletionTaskPublisher {
    private final IEventPublisher<Object> eventPublisher;

    @Value("${order.messaging.topics.order-completion:TODO_TOPIC}")
    private String topicId = "TODO_TOPIC";

    @Override
    public void publishOrderCompletionTask(OrderCompletionTaskEvent event) {
        eventPublisher.publish(topicId, event);
    }
}
