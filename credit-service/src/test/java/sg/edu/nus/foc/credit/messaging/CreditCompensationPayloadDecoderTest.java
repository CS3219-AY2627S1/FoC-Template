/*
 * AI Assistance Disclosure:
 * Tool: OpenAI Codex (GPT-5), date: 2026-10-27
 * Mode: Test generation and verification assistance.
 * Scope: Generated coverage for the Credit compensation workflow and its failure cases.
 * Author review: I reviewed for correctness
 */
package sg.edu.nus.foc.credit.messaging;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.Map;
import org.junit.jupiter.api.Test;
import sg.edu.nus.foc.credit.error.InvalidCompensationEventException;
import tools.jackson.databind.json.JsonMapper;

class CreditCompensationPayloadDecoderTest {

    private static final String SUBSCRIPTION = "projects/demo/subscriptions/compensation";
    private static final Map<String, String> ATTRIBUTES = Map.of(
            "eventType", "CreditCompensationRequested", "eventVersion", "1");
    private final CreditCompensationPayloadDecoder decoder = new CreditCompensationPayloadDecoder(
            JsonMapper.builder().findAndAddModules().build());

    @Test
    void validatesAndDecodesEveryOperationShape() {
        CreditCompensationRequest reserve = decoder.decode(SUBSCRIPTION, """
                {"eventId":"11111111-1111-4111-8111-111111111111",
                 "commandId":"reserve-key","operation":"RESERVE","orderId":"order-1",
                 "actorId":"requester-1","generation":2,"amount":5}
                """, ATTRIBUTES, SUBSCRIPTION);
        assertThat(reserve.amount()).isEqualTo(5);

        for (String operation : new String[]{"ASSIGN_COURIER", "CLEAR_COURIER"}) {
            CreditCompensationRequest request = decoder.decode(SUBSCRIPTION, """
                    {"eventId":"22222222-2222-4222-8222-222222222222",
                     "commandId":"assignment-key","operation":"%s","orderId":"order-1",
                     "actorId":"courier-1","generation":3}
                    """.formatted(operation), ATTRIBUTES, SUBSCRIPTION);
            assertThat(request.operation()).isEqualTo(operation);
            assertThat(request.amount()).isNull();
        }
    }

    @Test
    void rejectsWrongRoutingMalformedBindingsAndOperationAmounts() {
        String valid = """
                {"eventId":"11111111-1111-4111-8111-111111111111",
                 "commandId":"reserve-key","operation":"RESERVE","orderId":"order-1",
                 "actorId":"requester-1","generation":2,"amount":5}
                """;
        assertThatThrownBy(() -> decoder.decode("wrong", valid, ATTRIBUTES, SUBSCRIPTION))
                .isInstanceOf(InvalidCompensationEventException.class)
                .hasMessageContaining("subscription");
        assertThatThrownBy(() -> decoder.decode(SUBSCRIPTION, valid,
                Map.of("eventType", "Other", "eventVersion", "1"), SUBSCRIPTION))
                .isInstanceOf(InvalidCompensationEventException.class)
                .hasMessageContaining("unsupported");
        assertThatThrownBy(() -> decoder.decode(SUBSCRIPTION, "not-json", ATTRIBUTES, SUBSCRIPTION))
                .isInstanceOf(InvalidCompensationEventException.class)
                .hasMessageContaining("JSON");

        for (String body : new String[]{
                valid.replace("11111111-1111-4111-8111-111111111111", "not-a-uuid"),
                valid.replace("\"generation\":2", "\"generation\":0"),
                valid.replace("\"orderId\":\"order-1\"", "\"orderId\":\"a/b\""),
                valid.replace("\"operation\":\"RESERVE\"", "\"operation\":\"UNKNOWN\""),
                valid.replace("\"amount\":5", "\"amount\":0"),
                valid.replace("\"operation\":\"RESERVE\"", "\"operation\":\"ASSIGN_COURIER\"")}) {
            assertThatThrownBy(() -> decoder.decode(SUBSCRIPTION, body, ATTRIBUTES, SUBSCRIPTION))
                    .isInstanceOf(InvalidCompensationEventException.class);
        }

        assertThatThrownBy(() -> decoder.decode(SUBSCRIPTION, "null", ATTRIBUTES, SUBSCRIPTION))
                .isInstanceOf(InvalidCompensationEventException.class);
        assertThatThrownBy(() -> decoder.decode(SUBSCRIPTION,
                valid.replace("11111111-1111-4111-8111-111111111111", "null")
                        .replace("\"eventId\":\"null\"", "\"eventId\":null"),
                ATTRIBUTES, SUBSCRIPTION)).isInstanceOf(InvalidCompensationEventException.class);
        assertThatThrownBy(() -> decoder.decode(SUBSCRIPTION,
                valid.replace("11111111-1111-4111-8111-111111111111",
                        "ABCDEFAB-CDEF-4ABC-8DEF-ABCDEFABCDEF"), ATTRIBUTES, SUBSCRIPTION))
                .isInstanceOf(InvalidCompensationEventException.class);
        assertThatThrownBy(() -> decoder.decode(SUBSCRIPTION,
                valid.replace("\"amount\":5", "\"amount\":null"), ATTRIBUTES, SUBSCRIPTION))
                .isInstanceOf(InvalidCompensationEventException.class);

        for (String commandId : new String[]{"", " ", "x".repeat(129), "a/b", ".", "..", "__x__"}) {
            String body = valid.replace("\"commandId\":\"reserve-key\"",
                    "\"commandId\":\"" + commandId + "\"");
            assertThatThrownBy(() -> decoder.decode(SUBSCRIPTION, body, ATTRIBUTES, SUBSCRIPTION))
                    .isInstanceOf(InvalidCompensationEventException.class);
        }
        String nullCommand = valid.replace("\"commandId\":\"reserve-key\"", "\"commandId\":null");
        assertThatThrownBy(() -> decoder.decode(SUBSCRIPTION, nullCommand, ATTRIBUTES, SUBSCRIPTION))
                .isInstanceOf(InvalidCompensationEventException.class);
        String invalidActor = valid.replace("\"actorId\":\"requester-1\"", "\"actorId\":\" \"");
        assertThatThrownBy(() -> decoder.decode(SUBSCRIPTION, invalidActor, ATTRIBUTES, SUBSCRIPTION))
                .isInstanceOf(InvalidCompensationEventException.class);

        CreditCompensationRequest prefixOnly = decoder.decode(SUBSCRIPTION,
                valid.replace("\"commandId\":\"reserve-key\"", "\"commandId\":\"__x\""),
                ATTRIBUTES, SUBSCRIPTION);
        assertThat(prefixOnly.commandId()).isEqualTo("__x");
    }
}
