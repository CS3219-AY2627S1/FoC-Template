package sg.edu.nus.foc.credit.messaging;

@FunctionalInterface
public interface OrderCompletionEventHandler {

    void handle(OrderEventMessage message);
}
