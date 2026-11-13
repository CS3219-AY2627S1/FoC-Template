/*
 * AI Assistance Disclosure:
 * Tool: OpenAI Codex (GPT-5), date: 2026-10-26
 * Mode: Code generation.
 * Scope: Generated the controller to handle the user service pub/sub events based on the provided requirements contract.
 * Author review: I reviewed for correctness and edited where needed.
 */

package sg.edu.nus.foc.credit.api;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import jakarta.validation.Valid;
import java.nio.charset.StandardCharsets;
import java.util.Base64;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;
import sg.edu.nus.foc.credit.config.CreditPushProperties;
import sg.edu.nus.foc.credit.error.InvalidUserEventException;
import sg.edu.nus.foc.credit.messaging.UserCreatedEventHandler;
import sg.edu.nus.foc.credit.messaging.UserCreatedEventMessage;
import sg.edu.nus.foc.credit.messaging.UserCreatedEventPayloadDecoder;

@RestController
public class CreditUserEventController {

    private static final Logger log = LoggerFactory.getLogger(CreditUserEventController.class);

    public static final String USER_CREATED_PATH = "/api/credits/internal/user-events/created";

    private final UserCreatedEventPayloadDecoder decoder;
    private final CreditPushProperties properties;
    private final UserCreatedEventHandler handler;

    public CreditUserEventController(UserCreatedEventPayloadDecoder decoder,
                                     CreditPushProperties properties,
                                     UserCreatedEventHandler handler) {
        this.decoder = decoder;
        this.properties = properties;
        this.handler = handler;
    }

    @PostMapping(USER_CREATED_PATH)
    @Operation(summary = "Initialize a credit account from an authenticated user-created event")
    @ApiResponses({
            @ApiResponse(responseCode = "204", description = "Credit account initialized or event replayed"),
            @ApiResponse(responseCode = "400", description = "Push envelope or user-created event is invalid"),
            @ApiResponse(responseCode = "401", description = "Pub/Sub push identity is invalid"),
            @ApiResponse(responseCode = "409", description = "Event conflicts with persisted credit state"),
            @ApiResponse(responseCode = "503", description = "Credit persistence is unavailable")
    })
    public ResponseEntity<Void> receiveUserCreated(@Valid @RequestBody PubSubPushEnvelope envelope) {
        UserCreatedEventMessage message = null;
        try {
            message = decoder.decode(
                    envelope.subscription(),
                    decode(envelope.message().data()),
                    envelope.message().attributes(),
                    properties.userCreatedSubscriptionPath());
            logEvent("user_created_event_received", envelope.subscription(), message, "received");
            handler.handle(message);
            logEvent("user_created_event_processed", envelope.subscription(), message,
                    "acknowledgement_ready");
            return ResponseEntity.noContent().build();
        } catch (RuntimeException exception) {
            log.atWarn()
                    .addKeyValue("service", "credit-service")
                    .addKeyValue("subscription", envelope.subscription())
                    .addKeyValue("eventId", message == null ? null : message.eventId())
                    .addKeyValue("eventType", "UserCreated")
                    .addKeyValue("userId", message == null ? null : message.userId())
                    .addKeyValue("outcome", "failed")
                    .addKeyValue("errorType", exception.getClass().getSimpleName())
                    .addKeyValue("errorMessage", exception.getMessage())
                    .log("user_created_event_processing_failed");
            throw exception;
        }
    }

    private static String decode(String encoded) {
        try {
            return new String(Base64.getDecoder().decode(encoded), StandardCharsets.UTF_8);
        } catch (IllegalArgumentException exception) {
            throw new InvalidUserEventException("Pub/Sub message data is not valid Base64.");
        }
    }

    private static void logEvent(String logMessage, String subscription,
                                 UserCreatedEventMessage message, String outcome) {
        log.atInfo()
                .addKeyValue("service", "credit-service")
                .addKeyValue("subscription", subscription)
                .addKeyValue("eventId", message.eventId())
                .addKeyValue("eventType", "UserCreated")
                .addKeyValue("userId", message.userId())
                .addKeyValue("outcome", outcome)
                .log(logMessage);
    }
}
