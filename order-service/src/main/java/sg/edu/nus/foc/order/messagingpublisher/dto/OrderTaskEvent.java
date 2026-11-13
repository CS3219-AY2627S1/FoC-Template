package sg.edu.nus.foc.order.messagingpublisher.dto;

import java.time.Instant;

public interface OrderTaskEvent {
    String getEventId();

    String getEventType();

    int getEventVersion();

    String getOrderId();

    long getOrderVersion();

    Instant getOccurredAt();

}
