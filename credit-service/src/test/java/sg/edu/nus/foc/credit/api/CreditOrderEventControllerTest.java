package sg.edu.nus.foc.credit.api;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.Base64;
import java.util.Map;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.jupiter.api.Test;
import sg.edu.nus.foc.credit.config.CreditPushProperties;
import sg.edu.nus.foc.credit.error.InvalidOrderEventException;
import sg.edu.nus.foc.credit.messaging.OrderEventMessage;

class CreditOrderEventControllerTest {

    private static final CreditPushProperties PROPERTIES = new CreditPushProperties(
            "project", "audience", "push@u.nus.edu", "completion", "refund", "compensation", "user-created");

    @Test
    void twoEndpointsInvokeOnlyTheirDesignatedHandlers() {
        AtomicReference<String> expectedSubscription = new AtomicReference<>();
        AtomicReference<String> expectedEventType = new AtomicReference<>();
        AtomicReference<Map<String, String>> attributes = new AtomicReference<>();
        AtomicInteger refunds = new AtomicInteger();
        AtomicInteger completions = new AtomicInteger();
        CreditOrderEventController controller = new CreditOrderEventController(
                (subscription, payload, messageAttributes, expectedSource, expectedType) -> {
                    expectedSubscription.set(expectedSource);
                    expectedEventType.set(expectedType);
                    attributes.set(messageAttributes);
                    return message(expectedType);
                }, PROPERTIES, ignored -> refunds.incrementAndGet(),
                ignored -> completions.incrementAndGet());

        assertThat(controller.receiveOpenRefund(envelope(PROPERTIES.openRefundSubscriptionPath()))
                .getStatusCode().value()).isEqualTo(204);
        assertThat(expectedSubscription).hasValue(PROPERTIES.openRefundSubscriptionPath());
        assertThat(expectedEventType).hasValue("OpenOrderRefundTaskEvent");
        assertThat(attributes.get()).containsEntry("eventVersion", "2");

        assertThat(controller.receiveCompletion(envelope(PROPERTIES.completionSubscriptionPath()))
                .getStatusCode().value()).isEqualTo(204);
        assertThat(expectedSubscription).hasValue(PROPERTIES.completionSubscriptionPath());
        assertThat(expectedEventType).hasValue("OrderCompletionTaskEvent");
        assertThat(refunds).hasValue(1);
        assertThat(completions).hasValue(1);
    }

    @Test
    void rejectsInvalidBase64WithoutCallingDecoderOrHandler() {
        CreditOrderEventController controller = new CreditOrderEventController(
                (subscription, payload, attributes, expectedSource, expectedType) -> {
                    throw new AssertionError("decoder must not be called");
                }, PROPERTIES,
                ignored -> { throw new AssertionError("handler must not be called"); },
                ignored -> { throw new AssertionError("handler must not be called"); });
        PubSubPushEnvelope envelope = new PubSubPushEnvelope(
                new PubSubPushEnvelope.Message("%%%", "message-1", Map.of()),
                PROPERTIES.openRefundSubscriptionPath());

        assertThatThrownBy(() -> controller.receiveOpenRefund(envelope))
                .isInstanceOf(InvalidOrderEventException.class);
    }

    @Test
    void propagatesHandlerFailureSoPubSubRetries() {
        CreditOrderEventController controller = new CreditOrderEventController(
                (subscription, payload, attributes, expectedSource, expectedType) -> message(expectedType),
                PROPERTIES, ignored -> { },
                ignored -> { throw new IllegalStateException("database unavailable"); });

        assertThatThrownBy(() -> controller.receiveCompletion(
                envelope(PROPERTIES.completionSubscriptionPath())))
                .isInstanceOf(IllegalStateException.class);
    }

    private static PubSubPushEnvelope envelope(String subscription) {
        String encoded = Base64.getEncoder().encodeToString(
                "event-json".getBytes(StandardCharsets.UTF_8));
        return new PubSubPushEnvelope(
                new PubSubPushEnvelope.Message(encoded, "message-1", Map.of(
                        "eventId", "event-1", "eventType", "OrderCompletionTaskEvent",
                        "eventVersion", "2")), subscription);
    }

    private static OrderEventMessage message(String eventType) {
        return new OrderEventMessage("event-1", eventType, "order-1", "COMPLETED", 10,
                Instant.parse("2026-10-08T08:00:00Z"), "courier-1");
    }
}
