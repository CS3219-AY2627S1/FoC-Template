/*
 * AI Assistance Disclosure:
 * Tool: OpenAI Codex (GPT-5), date: 2026-10-27
 * Mode: Test generation and verification assistance.
 * Scope: Generated coverage for the Credit compensation workflow and its failure cases.
 * Author review: I reviewed for correctness
 */
package sg.edu.nus.foc.credit.api;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.nio.charset.StandardCharsets;
import java.util.Base64;
import java.util.Map;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.jupiter.api.Test;
import org.springframework.context.ApplicationEventPublisher;
import sg.edu.nus.foc.credit.config.CreditPushProperties;
import sg.edu.nus.foc.credit.error.InvalidCompensationEventException;
import sg.edu.nus.foc.credit.messaging.CreditCompensationPayloadDecoder;
import sg.edu.nus.foc.credit.messaging.CreditCompensationRequest;
import sg.edu.nus.foc.credit.messaging.CreditCompensationService;
import sg.edu.nus.foc.credit.persistence.CreditCompensationStore;

class CreditCompensationControllerTest {

    private static final CreditPushProperties PROPERTIES = new CreditPushProperties(
            "demo", "audience", "push@u.nus.edu", "completion", "refund", "compensation", "user-created");

    @Test
    void decodesAgainstConfiguredSubscriptionAndAcknowledgesAfterServiceReturns() {
        AtomicReference<String> expectedSubscription = new AtomicReference<>();
        AtomicReference<CreditCompensationRequest> handled = new AtomicReference<>();
        CreditCompensationRequest request = new CreditCompensationRequest(
                "11111111-1111-4111-8111-111111111111", "key", "RESERVE",
                "order", "requester", 2, 4L);
        CreditCompensationPayloadDecoder decoder = new CreditCompensationPayloadDecoder(null) {
            @Override
            public CreditCompensationRequest decode(String subscription, String json,
                                                    Map<String, String> attributes,
                                                    String configuredSubscription) {
                expectedSubscription.set(configuredSubscription);
                return request;
            }
        };
        CreditCompensationService service = new CreditCompensationService(null,
                (ApplicationEventPublisher) event -> { }, new io.micrometer.core.instrument.simple.SimpleMeterRegistry()) {
            @Override
            public CreditCompensationStore.Processed process(CreditCompensationRequest value) {
                handled.set(value);
                return null;
            }
        };
        CreditCompensationController controller = new CreditCompensationController(decoder, service, PROPERTIES);

        assertThat(controller.receive(envelope("{}" )).getStatusCode().value()).isEqualTo(204);
        assertThat(expectedSubscription).hasValue(PROPERTIES.compensationSubscriptionPath());
        assertThat(handled).hasValue(request);
    }

    @Test
    void invalidBase64NeverInvokesDecoderOrService() {
        CreditCompensationPayloadDecoder decoder = new CreditCompensationPayloadDecoder(null) {
            @Override
            public CreditCompensationRequest decode(String subscription, String json,
                                                    Map<String, String> attributes,
                                                    String configuredSubscription) {
                throw new AssertionError("decoder must not be called");
            }
        };
        CreditCompensationController controller = new CreditCompensationController(
                decoder, null, PROPERTIES);
        PubSubPushEnvelope envelope = new PubSubPushEnvelope(
                new PubSubPushEnvelope.Message("%%%", "message", Map.of()),
                PROPERTIES.compensationSubscriptionPath());

        assertThatThrownBy(() -> controller.receive(envelope))
                .isInstanceOf(InvalidCompensationEventException.class)
                .hasMessageContaining("Base64");
    }

    private static PubSubPushEnvelope envelope(String json) {
        return new PubSubPushEnvelope(new PubSubPushEnvelope.Message(
                Base64.getEncoder().encodeToString(json.getBytes(StandardCharsets.UTF_8)),
                "message", Map.of("eventType", "CreditCompensationRequested", "eventVersion", "1")),
                PROPERTIES.compensationSubscriptionPath());
    }
}
