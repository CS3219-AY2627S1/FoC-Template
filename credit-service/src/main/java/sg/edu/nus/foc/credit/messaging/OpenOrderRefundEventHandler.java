package sg.edu.nus.foc.credit.messaging;

@FunctionalInterface
public interface OpenOrderRefundEventHandler {

    void handle(OrderEventMessage message);
}
