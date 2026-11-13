package sg.edu.nus.foc.order.messagingpublisher.publisher;

import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import sg.edu.nus.foc.order.messagingpublisher.dto.OpenOrderRefundTaskEvent;
import sg.edu.nus.foc.order.messagingpublisher.interfaces.IEventPublisher;
import sg.edu.nus.foc.order.messagingpublisher.interfaces.IOpenOrderRefundTaskPublisher;

@Component
@RequiredArgsConstructor
public class OpenOrderRefundTaskPublisher implements IOpenOrderRefundTaskPublisher {
    private final IEventPublisher<Object> eventPublisher;

    @Value("${order.messaging.topics.open-order-refund:TODO_TOPIC}")
    private String topicId = "TODO_TOPIC";

    @Override
    public void publishOpenOrderRefundTask(OpenOrderRefundTaskEvent event) {
        eventPublisher.publish(topicId, event);
    }
}
