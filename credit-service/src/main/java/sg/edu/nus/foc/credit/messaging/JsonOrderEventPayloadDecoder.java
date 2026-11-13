/*
 * AI Assistance Disclosure:
 * Tool: OpenAI Codex (GPT-5), date: 2026-10-08
 * Mode: Code generation.
 * Scope: Generated the order event decoder. 
 * Author review: I reviewed for correctness and edited where needed.
 */

package sg.edu.nus.foc.credit.messaging;

import java.util.Map;
import java.util.Objects;
import org.springframework.stereotype.Component;
import sg.edu.nus.foc.credit.error.InvalidOrderEventException;
import tools.jackson.databind.json.JsonMapper;

@Component
public class JsonOrderEventPayloadDecoder implements OrderEventPayloadDecoder {

    private final JsonMapper mapper;

    public JsonOrderEventPayloadDecoder(JsonMapper mapper) {
        this.mapper = mapper;
    }

    @Override
    public OrderEventMessage decode(String subscription, String payload, Map<String, String> attributes,
                                    String expectedSubscription, String expectedEventType) {
        OrderEventMessage message;
        try {
            message = mapper.readValue(payload, OrderEventMessage.class);
        } catch (RuntimeException exception) {
            throw new InvalidOrderEventException("Order event compact body is not valid JSON.");
        }
        if (!expectedSubscription.equals(subscription)) {
            throw new InvalidOrderEventException(
                    "Order event was delivered by the wrong Pub/Sub subscription.");
        }
        if (!expectedEventType.equals(message.eventType())) {
            throw new InvalidOrderEventException(
                    "Order event type does not match its push endpoint.");
        }
        if (message.eventId() == null || message.eventId().isBlank()
                || message.orderId() == null || message.orderId().isBlank()
                || message.orderStatus() == null || message.orderStatus().isBlank()
                || message.creditAmount() <= 0 || message.occurredAt() == null) {
            throw new InvalidOrderEventException("Order event compact body is incomplete or invalid.");
        }
        if (attributes == null
                || !"2".equals(attributes.get("eventVersion"))
                || !Objects.equals(message.eventId(), attributes.get("eventId"))
                || !Objects.equals(message.eventType(), attributes.get("eventType"))) {
            throw new InvalidOrderEventException(
                    "Order event body does not match its Pub/Sub attributes.");
        }
        return message;
    }
}
