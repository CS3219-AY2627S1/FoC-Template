package com.campuscouriers.notification_service.event;

import java.nio.charset.StandardCharsets;
import java.util.UUID;
import org.apache.kafka.clients.consumer.ConsumerRecord;
import org.apache.kafka.common.header.Header;
import org.springframework.stereotype.Component;

@Component
public class ErrandEventParser {
    public ErrandEvent parse(ConsumerRecord<String, String> record) {
        UUID eventId = eventId(record);
        EventPayload payload = EventPayload.read(record.value());
        return new ErrandEvent(eventId, payload.uuid("errandId"), payload.uuid("requesterId"),
            payload.uuid("courierId"), payload.positiveLong("creditValue"));
    }

    UUID eventId(ConsumerRecord<String, String> record) {
        Header header = record.headers().lastHeader("eventId");
        if (header == null || header.value() == null) {
            throw new InvalidNotificationEventException("Missing eventId header");
        }
        return EventPayload.parseUuid(
            new String(header.value(), StandardCharsets.UTF_8), "eventId header");
    }
}
