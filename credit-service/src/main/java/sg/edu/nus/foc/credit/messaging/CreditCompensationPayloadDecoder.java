/*
 * AI Assistance Disclosure:
 * Tool: OpenAI Codex (GPT-5), date: 2026-10-27
 * Mode: Code generation and implementation assistance.
 * Scope: Generated the Credit compensation workflow implementation from the approved cross-service contract.
 * Author review: I reviewed for correctness
 */
package sg.edu.nus.foc.credit.messaging;

import java.util.Map;
import java.util.UUID;
import org.springframework.stereotype.Component;
import sg.edu.nus.foc.credit.credit.CreditCommandOperation;
import sg.edu.nus.foc.credit.error.InvalidCompensationEventException;
import tools.jackson.core.JacksonException;
import tools.jackson.databind.json.JsonMapper;

@Component
public class CreditCompensationPayloadDecoder {

    private final JsonMapper mapper;

    public CreditCompensationPayloadDecoder(JsonMapper mapper) {
        this.mapper = mapper;
    }

    public CreditCompensationRequest decode(String subscription, String json,
                                            Map<String, String> attributes,
                                            String expectedSubscription) {
        if (!expectedSubscription.equals(subscription)) {
            throw invalid("Pub/Sub subscription does not match the compensation receiver.");
        }
        if (!"CreditCompensationRequested".equals(attributes.get("eventType"))
                || !"1".equals(attributes.get("eventVersion"))) {
            throw invalid("Compensation event type or version is unsupported.");
        }
        CreditCompensationRequest request;
        try {
            request = mapper.readValue(json, CreditCompensationRequest.class);
        } catch (JacksonException exception) {
            throw invalid("Compensation event data is not valid JSON.");
        }
        validate(request);
        return request;
    }

    private static void validate(CreditCompensationRequest request) {
        if (request == null || !uuid(request.eventId())
                || invalidOpaque(request.commandId(), 128)
                || invalidOpaque(request.actorId(), 128)
                || invalidOpaque(request.orderId(), 36)
                || request.generation() <= 0) {
            throw invalid("Compensation event identifiers or generation are invalid.");
        }
        CreditCommandOperation operation;
        try {
            operation = CreditCommandOperation.valueOf(request.operation());
        } catch (RuntimeException exception) {
            throw invalid("Compensation operation is invalid.");
        }
        if (operation == CreditCommandOperation.RESERVE) {
            if (request.amount() == null || request.amount() <= 0) {
                throw invalid("RESERVE compensation requires a positive amount.");
            }
        } else if (request.amount() != null) {
            throw invalid("Only RESERVE compensation may include amount.");
        }
    }

    private static boolean invalidOpaque(String value, int max) {
        return value == null || value.isBlank() || value.length() > max || value.contains("/")
                || value.equals(".") || value.equals("..")
                || value.startsWith("__") && value.endsWith("__");
    }

    private static boolean uuid(String value) {
        try {
            return value != null && UUID.fromString(value).toString().equals(value);
        } catch (IllegalArgumentException exception) {
            return false;
        }
    }

    private static InvalidCompensationEventException invalid(String message) {
        return new InvalidCompensationEventException(message);
    }
}
