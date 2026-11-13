/*
 * AI Assistance Disclosure:
 * Tool: OpenAI Codex (GPT-5), date: 2026-10-26
 * Mode: Code generation.
 * Scope: Generated the controller tests to handle the user service pub/sub events based on the provided requirements contract.
 * Author review: I reviewed for correctness and edited where needed.
 */

package sg.edu.nus.foc.credit.api;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.Base64;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.jupiter.api.Test;
import sg.edu.nus.foc.credit.config.CreditPushProperties;
import sg.edu.nus.foc.credit.error.InvalidUserEventException;
import sg.edu.nus.foc.credit.messaging.UserCreatedEventMessage;

class CreditUserEventControllerTest {

    private static final CreditPushProperties PROPERTIES = new CreditPushProperties(
            "project", "audience", "push@u.nus.edu", "completion", "refund", "compensation", "user-created");
    private static final UserCreatedEventMessage MESSAGE = new UserCreatedEventMessage(
            UUID.fromString("c91e4571-329a-4399-b87f-a756a6ab7243"),
            "user-1", "user@u.nus.edu", Instant.parse("2026-10-25T08:00:00Z"), 1);

    @Test
    void invokesTypedDecoderAndHandler() {
        AtomicReference<String> expectedSubscription = new AtomicReference<>();
        AtomicReference<UserCreatedEventMessage> handled = new AtomicReference<>();
        CreditUserEventController controller = new CreditUserEventController(
                (subscription, payload, attributes, expectedSource) -> {
                    expectedSubscription.set(expectedSource);
                    return MESSAGE;
                }, PROPERTIES, handled::set);

        assertThat(controller.receiveUserCreated(envelope()).getStatusCode().value()).isEqualTo(204);
        assertThat(expectedSubscription).hasValue(PROPERTIES.userCreatedSubscriptionPath());
        assertThat(handled).hasValue(MESSAGE);
    }

    @Test
    void rejectsInvalidBase64BeforeDecoding() {
        CreditUserEventController controller = new CreditUserEventController(
                (subscription, payload, attributes, expectedSource) -> {
                    throw new AssertionError("decoder must not be called");
                }, PROPERTIES, ignored -> {
                    throw new AssertionError("handler must not be called");
                });
        PubSubPushEnvelope envelope = new PubSubPushEnvelope(
                new PubSubPushEnvelope.Message("%%%", "message-1", Map.of()),
                PROPERTIES.userCreatedSubscriptionPath());

        assertThatThrownBy(() -> controller.receiveUserCreated(envelope))
                .isInstanceOf(InvalidUserEventException.class);
    }

    @Test
    void propagatesHandlerFailureSoPubSubRetries() {
        CreditUserEventController controller = new CreditUserEventController(
                (subscription, payload, attributes, expectedSource) -> MESSAGE,
                PROPERTIES,
                ignored -> { throw new IllegalStateException("database unavailable"); });

        assertThatThrownBy(() -> controller.receiveUserCreated(envelope()))
                .isInstanceOf(IllegalStateException.class);
    }

    private static PubSubPushEnvelope envelope() {
        String encoded = Base64.getEncoder().encodeToString(
                "event-json".getBytes(StandardCharsets.UTF_8));
        return new PubSubPushEnvelope(
                new PubSubPushEnvelope.Message(encoded, "message-1", Map.of(
                        "eventId", MESSAGE.eventId().toString(),
                        "eventType", "UserCreated",
                        "eventVersion", "1")),
                PROPERTIES.userCreatedSubscriptionPath());
    }
}
