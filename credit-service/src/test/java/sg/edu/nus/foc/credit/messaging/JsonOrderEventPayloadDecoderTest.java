package sg.edu.nus.foc.credit.messaging;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.Map;
import java.util.Arrays;
import org.junit.jupiter.api.Test;
import sg.edu.nus.foc.credit.error.InvalidOrderEventException;
import tools.jackson.databind.json.JsonMapper;

class JsonOrderEventPayloadDecoderTest {

    private static final String SUBSCRIPTION = "projects/project/subscriptions/completion";
    private static final String TYPE = "OrderCompletionTaskEvent";
    private static final Map<String, String> ATTRIBUTES = Map.of(
            "eventId", "event-1", "eventType", TYPE, "eventVersion", "2");
    private final JsonOrderEventPayloadDecoder decoder = new JsonOrderEventPayloadDecoder(
            JsonMapper.builder().findAndAddModules().build());

    @Test
    void decodesCompactV2Event() {
        OrderEventMessage message = decoder.decode(
                SUBSCRIPTION, eventJson(TYPE), ATTRIBUTES, SUBSCRIPTION, TYPE);
        assertThat(message).isEqualTo(new OrderEventMessage(
                "event-1", TYPE, "order-1", "COMPLETED", 10,
                java.time.Instant.parse("2026-10-08T08:00:00Z"), "courier-1"));
    }

    @Test
    void rejectsWrongSubscriptionEndpointOrAttributes() {
        assertThatThrownBy(() -> decoder.decode(
                "projects/project/subscriptions/refund", eventJson(TYPE), ATTRIBUTES,
                SUBSCRIPTION, TYPE))
                .isInstanceOf(InvalidOrderEventException.class).hasMessageContaining("subscription");
        assertThatThrownBy(() -> decoder.decode(
                SUBSCRIPTION, eventJson(TYPE), ATTRIBUTES,
                SUBSCRIPTION, "OpenOrderRefundTaskEvent"))
                .isInstanceOf(InvalidOrderEventException.class).hasMessageContaining("endpoint");
        for (Map<String, String> attributes : Arrays.asList(
                null,
                Map.of("eventId", "other", "eventType", TYPE, "eventVersion", "2"),
                Map.of("eventId", "event-1", "eventType", "other", "eventVersion", "2"),
                Map.of("eventId", "event-1", "eventType", TYPE, "eventVersion", "1"))) {
            assertThatThrownBy(() -> decoder.decode(
                    SUBSCRIPTION, eventJson(TYPE), attributes, SUBSCRIPTION, TYPE))
                    .isInstanceOf(InvalidOrderEventException.class).hasMessageContaining("attributes");
        }
    }

    @Test
    void oldSnapshotPayloadCannotSatisfyCompactContract() {
        String old = """
                {"eventId":"event-1","eventType":"OrderCompletionTaskEvent",
                 "orderId":"order-1","order":{"status":"COMPLETED","offeredCredits":10}}
                """;
        assertThatThrownBy(() -> decoder.decode(SUBSCRIPTION, old, ATTRIBUTES, SUBSCRIPTION, TYPE))
                .isInstanceOf(InvalidOrderEventException.class)
                .hasMessageContaining("compact body");
    }

    private static String eventJson(String eventType) {
        return """
                {"eventId":"event-1","eventType":"%s","orderId":"order-1",
                 "orderStatus":"COMPLETED","creditAmount":10,
                 "occurredAt":"2026-10-08T08:00:00Z","courierId":"courier-1"}
                """.formatted(eventType);
    }
}
