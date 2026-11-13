package sg.edu.nus.foc.order.messagingpublisher.interfaces;

import sg.edu.nus.foc.order.messagingpublisher.dto.OpenOrderRefundTaskEvent;

public interface IOpenOrderRefundTaskPublisher {
    void publishOpenOrderRefundTask(OpenOrderRefundTaskEvent event);
}
