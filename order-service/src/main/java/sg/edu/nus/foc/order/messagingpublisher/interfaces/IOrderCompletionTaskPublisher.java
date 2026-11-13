package sg.edu.nus.foc.order.messagingpublisher.interfaces;

import sg.edu.nus.foc.order.messagingpublisher.dto.OrderCompletionTaskEvent;

public interface IOrderCompletionTaskPublisher {
    void publishOrderCompletionTask(OrderCompletionTaskEvent event);
}
