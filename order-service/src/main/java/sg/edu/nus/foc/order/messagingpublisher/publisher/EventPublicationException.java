package sg.edu.nus.foc.order.messagingpublisher.publisher;

public class EventPublicationException extends RuntimeException {
    public EventPublicationException(String message) {
        super(message);
    }

    public EventPublicationException(String message, Throwable cause) {
        super(message, cause);
    }
}
