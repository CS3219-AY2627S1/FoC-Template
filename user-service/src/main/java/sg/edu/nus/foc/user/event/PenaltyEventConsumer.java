/*
 * AI Assistance Disclosure:
 * Tool: OpenAI Codex (GPT-5), date: 2026-10-31
 * Mode: Code generation.
 * Scope: Generated Java implementation of the consumption of Google PubSub events.
 * Author review: I reviewed for correctness.
 */

package sg.edu.nus.foc.user.event;

import java.io.IOException;
import java.util.Base64;
import java.util.Map;

import org.springframework.dao.DuplicateKeyException;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

import tools.jackson.core.JacksonException;
import tools.jackson.databind.json.JsonMapper;

import lombok.RequiredArgsConstructor;

import sg.edu.nus.foc.common.penalty.PenaltySystemPolicy;
import sg.edu.nus.foc.user.event.PenaltyScoreEvent;
import sg.edu.nus.foc.user.dto.PubSubPushRequest;
import sg.edu.nus.foc.user.logic.UserService;

@Service
@RequiredArgsConstructor
public class PenaltyEventConsumer {

    private static final String ADDITION_EVENT =
            "PenaltyScoreAdditionEvent";

    private static final String DEDUCTION_EVENT =
            "PenaltyScoreDeductionEvent";

    private static final String EVENT_VERSION = "1";

    private final JsonMapper jsonMapper;
    private final UserService userService;
    private final PenaltyEventProcessingService processingService;

    // Consume a penalty addition event.
    public void consumeAddition(PubSubPushRequest request) {
        PenaltyScoreEvent event = decodeEvent(request);

        validateEvent(event, request, ADDITION_EVENT);

        try {
            processingService.process(event, event.penaltyAmount());
        } catch (DuplicateKeyException e) {
            // Event was already processed. Acknowledge without applying it again.
        }
    }

    // Consume a penalty deduction event.
    public void consumeDeduction(PubSubPushRequest request) {
        PenaltyScoreEvent event = decodeEvent(request);

        validateEvent(event, request, DEDUCTION_EVENT);

        try {
            processingService.process(event, -event.penaltyAmount());
        } catch (DuplicateKeyException e) {
            // Event was already processed. Acknowledge without applying it again.
        }
    }

    // Decode the Base64 payload and deserialize the event.
    private PenaltyScoreEvent decodeEvent(PubSubPushRequest request) {

        if (request == null || request.message() == null) {
            throw badRequest("Missing Pub/Sub message");
        }

        String encodedData = request.message().data();

        if (encodedData == null || encodedData.isBlank()) {
            throw badRequest("Missing Pub/Sub message data");
        }

        try {
            byte[] decodedData = Base64.getDecoder().decode(encodedData);

            return jsonMapper.readValue(decodedData, PenaltyScoreEvent.class);

        } catch (IllegalArgumentException | JacksonException e) {
            throw badRequest("Invalid penalty event payload");
        }
    }

    // Validate the event body and Pub/Sub message attributes.
    private void validateEvent(
            PenaltyScoreEvent event,
            PubSubPushRequest request,
            String expectedEventType
    ) {

        if (event == null) {
            throw badRequest("Penalty event cannot be null");
        }

        // Validate required fields.
        if (isBlank(event.eventId())
                || isBlank(event.eventType())
                || isBlank(event.orderId())
                || isBlank(event.courierId())
                || isBlank(event.appliedReason())
                || event.occurredAt() == null) {

            throw badRequest("Penalty event contains missing fields");
        }

        // Validate event type against the receiving endpoint.
        if (!expectedEventType.equals(event.eventType())) {
            throw badRequest("Unexpected penalty event type");
        }

        // Penalty amount must always be positive in the event.
        if (event.penaltyAmount() <= 0) {
            throw badRequest("Penalty amount must be positive");
        }

        // Validate Pub/Sub attributes against the event body.
        Map<String, String> attributes =
                request.message().attributes();

        if (attributes == null) {
            throw badRequest("Missing Pub/Sub message attributes");
        }

        if (!event.eventId().equals(attributes.get("eventId"))) {
            throw badRequest("Event ID does not match Pub/Sub attributes");
        }

        if (!event.eventType().equals(attributes.get("eventType"))) {
            throw badRequest("Event type does not match Pub/Sub attributes");
        }

        if (!EVENT_VERSION.equals(attributes.get("eventVersion"))) {
            throw badRequest("Unsupported penalty event version");
        }

        // Validate reason and amount against the shared penalty policy.
        validatePolicy(event, expectedEventType);
    }

    /**
     * Ensure the event reason and amount agree with PenaltySystemPolicy.
     */
    private void validatePolicy(
            PenaltyScoreEvent event,
            String expectedEventType
    ) {

        PenaltySystemPolicy policy;

        try {
            policy = PenaltySystemPolicy.valueOf(event.appliedReason());
        } catch (IllegalArgumentException e) {
            throw badRequest("Unknown penalty reason");
        }

        if (policy == PenaltySystemPolicy.COURIER_UNRESPONSIVE) {
            throw badRequest("Deprecated penalty reason cannot be published");
        }

        boolean isDeduction =
                DEDUCTION_EVENT.equals(expectedEventType);

        if (isDeduction
                && policy != PenaltySystemPolicy.SUCCESSFUL_DELIVERY) {
            throw badRequest("Invalid reason for penalty deduction");
        }

        if (!isDeduction
                && policy == PenaltySystemPolicy.SUCCESSFUL_DELIVERY) {
            throw badRequest("Successful delivery must use deduction event");
        }

        if (event.penaltyAmount() != policy.getPenaltyAmount()) {
            throw badRequest("Penalty amount does not match policy");
        }
    }

    private boolean isBlank(String value) {
        return value == null || value.isBlank();
    }

    private ResponseStatusException badRequest(String message) {
        return new ResponseStatusException(
                HttpStatus.BAD_REQUEST,
                message
        );
    }
}