/*
 * AI Assistance Disclosure:
 * Tool: OpenAI Codex (GPT-5), date: 2026-10-26
 * Mode: Code generation.
 * Scope: Generated the user event decoder tests to handle the user service pub/sub events based on the provided requirements contract.
 * Author review: I reviewed for correctness and edited where needed.
 */

package sg.edu.nus.foc.credit.messaging;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.time.Instant;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import sg.edu.nus.foc.credit.error.InvalidUserEventException;
import tools.jackson.databind.json.JsonMapper;

class JsonUserCreatedEventPayloadDecoderTest {

    private static final UUID EVENT_ID = UUID.fromString("c91e4571-329a-4399-b87f-a756a6ab7243");
    private static final String SUBSCRIPTION = "projects/project/subscriptions/user-created";
    private static final Map<String, String> ATTRIBUTES = Map.of(
            "eventId", EVENT_ID.toString(),
            "eventType", "UserCreated",
            "eventVersion", "1");

    private final JsonUserCreatedEventPayloadDecoder decoder =
            new JsonUserCreatedEventPayloadDecoder(
                    JsonMapper.builder().findAndAddModules().build());

    @Test
    void decodesUserCreatedV1Event() {
        UserCreatedEventMessage message = decoder.decode(
                SUBSCRIPTION, eventJson(1), ATTRIBUTES, SUBSCRIPTION);

        assertThat(message).isEqualTo(new UserCreatedEventMessage(
                EVENT_ID, "user-1", "user@u.nus.edu",
                Instant.parse("2026-10-25T08:00:00Z"), 1));
    }

    @Test
    void rejectsWrongSubscriptionOrMismatchedAttributes() {
        assertThatThrownBy(() -> decoder.decode(
                "projects/project/subscriptions/other", eventJson(1), ATTRIBUTES, SUBSCRIPTION))
                .isInstanceOf(InvalidUserEventException.class)
                .hasMessageContaining("subscription");
        assertThatThrownBy(() -> decoder.decode(
                SUBSCRIPTION, eventJson(1), Map.of(
                        "eventId", "other",
                        "eventType", "UserCreated",
                        "eventVersion", "1"), SUBSCRIPTION))
                .isInstanceOf(InvalidUserEventException.class)
                .hasMessageContaining("attributes");
        assertThatThrownBy(() -> decoder.decode(
                SUBSCRIPTION, eventJson(1), Map.of(
                        "eventId", EVENT_ID.toString(),
                        "eventType", "Other",
                        "eventVersion", "1"), SUBSCRIPTION))
                .isInstanceOf(InvalidUserEventException.class)
                .hasMessageContaining("attributes");
    }

    @Test
    void rejectsMalformedIncompleteAndUnsupportedEvents() {
        assertThatThrownBy(() -> decoder.decode(
                SUBSCRIPTION, "not-json", ATTRIBUTES, SUBSCRIPTION))
                .isInstanceOf(InvalidUserEventException.class)
                .hasMessageContaining("valid JSON");
        assertThatThrownBy(() -> decoder.decode(
                SUBSCRIPTION, eventJson(2), ATTRIBUTES, SUBSCRIPTION))
                .isInstanceOf(InvalidUserEventException.class)
                .hasMessageContaining("unsupported schema");
        assertThatThrownBy(() -> decoder.decode(
                SUBSCRIPTION,
                "{\"eventId\":\"" + EVENT_ID + "\",\"schemaVersion\":1}",
                ATTRIBUTES, SUBSCRIPTION))
                .isInstanceOf(InvalidUserEventException.class)
                .hasMessageContaining("incomplete");
    }

    private static String eventJson(int schemaVersion) {
        return """
                {"eventId":"%s","userId":"user-1","email":"user@u.nus.edu",
                 "occurredAt":"2026-10-25T08:00:00Z","schemaVersion":%d}
                """.formatted(EVENT_ID, schemaVersion);
    }
}
