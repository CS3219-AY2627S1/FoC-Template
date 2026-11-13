package sg.edu.nus.foc.order.messagingpublisher.interfaces;

public interface IEventPublisher<T> {
    String publish(String topicId, T event);
}
