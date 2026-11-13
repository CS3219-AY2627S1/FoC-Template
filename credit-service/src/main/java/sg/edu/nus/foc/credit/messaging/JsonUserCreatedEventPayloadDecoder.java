/*
 * AI Assistance Disclosure:
 * Tool: OpenAI Codex (GPT-5), date: 2026-10-26
 * Mode: Code generation.
 * Scope: Generated the decder to handle the user service pub/sub events based on the provided requirements contract.
 * Author review: I reviewed for correctness and edited where needed.
 */

package sg.edu.nus.foc.credit.messaging;

import java.util.Map;
import java.util.Objects;
import org.springframework.stereotype.Component;
import sg.edu.nus.foc.credit.error.InvalidUserEventException;
import tools.jackson.databind.json.JsonMapper;

@Component
public class JsonUserCreatedEventPayloadDecoder implements UserCreatedEventPayloadDecoder {

    private static final String EVENT_TYPE = "UserCreated";
    private static final String EVENT_VERSION = "1";

    private final JsonMapper mapper;

    public JsonUserCreatedEventPayloadDecoder(JsonMapper mapper) {
        this.mapper = mapper;
    }

    @Override
    public UserCreatedEventMessage decode(String subscription, String payload,
                                          Map<String, String> attributes,
                                          String expectedSubscription) {
        UserCreatedEventMessage message;
        try {
            message = mapper.readValue(payload, UserCreatedEventMessage.class);
        } catch (RuntimeException exception) {
            throw new InvalidUserEventException("User-created event body is not valid JSON.");
        }
        if (!expectedSubscription.equals(subscription)) {
            throw new InvalidUserEventException(
                    "User-created event was delivered by the wrong Pub/Sub subscription.");
        }
        if (message.eventId() == null
                || message.userId() == null || message.userId().isBlank()
                || message.email() == null || message.email().isBlank()
                || message.occurredAt() == null
                || message.schemaVersion() != 1) {
            throw new InvalidUserEventException(
                    "User-created event body is incomplete or uses an unsupported schema.");
        }
        if (attributes == null
                || !EVENT_VERSION.equals(attributes.get("eventVersion"))
                || !Objects.equals(message.eventId().toString(), attributes.get("eventId"))
                || !EVENT_TYPE.equals(attributes.get("eventType"))) {
            throw new InvalidUserEventException(
                    "User-created event body does not match its Pub/Sub attributes.");
        }
        return message;
    }
}
