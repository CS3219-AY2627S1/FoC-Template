/*
 * AI Assistance Disclosure:
 * Tool: OpenAI Codex (GPT-5), date: 2026-10-08
 * Mode: Code generation.
 * Scope: Generated the controller to handle the order service pub/sub events based on the provided requirements contract.
 * Author review: I reviewed for correctness and edited where needed.
 */

package sg.edu.nus.foc.credit.api;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import jakarta.validation.Valid;
import java.nio.charset.StandardCharsets;
import java.util.Base64;
import java.util.function.Consumer;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;
import sg.edu.nus.foc.credit.config.CreditPushProperties;
import sg.edu.nus.foc.credit.error.InvalidOrderEventException;
import sg.edu.nus.foc.credit.messaging.OpenOrderRefundEventHandler;
import sg.edu.nus.foc.credit.messaging.OrderCompletionEventHandler;
import sg.edu.nus.foc.credit.messaging.OrderEventMessage;
import sg.edu.nus.foc.credit.messaging.OrderEventPayloadDecoder;

@RestController
public class CreditOrderEventController {

    private static final Logger log = LoggerFactory.getLogger(CreditOrderEventController.class);

    public static final String PUSH_PATH = "/api/credits/internal/order-events";
    public static final String OPEN_REFUND_PATH = PUSH_PATH + "/open-refund";
    public static final String COMPLETION_PATH = PUSH_PATH + "/completion";

    private static final String OPEN_REFUND_TYPE = "OpenOrderRefundTaskEvent";
    private static final String COMPLETION_TYPE = "OrderCompletionTaskEvent";

    private final OrderEventPayloadDecoder decoder;
    private final CreditPushProperties properties;
    private final OpenOrderRefundEventHandler openRefundHandler;
    private final OrderCompletionEventHandler completionHandler;

    public CreditOrderEventController(OrderEventPayloadDecoder decoder,
                                      CreditPushProperties properties,
                                      OpenOrderRefundEventHandler openRefundHandler,
                                      OrderCompletionEventHandler completionHandler) {
        this.decoder = decoder;
        this.properties = properties;
        this.openRefundHandler = openRefundHandler;
        this.completionHandler = completionHandler;
    }

    @PostMapping(OPEN_REFUND_PATH)
    @Operation(summary = "Process an authenticated open-order refund event")
    @ApiResponses({
            @ApiResponse(responseCode = "204", description = "Event committed or replayed idempotently"),
            @ApiResponse(responseCode = "400", description = "Push envelope or Order event is invalid"),
            @ApiResponse(responseCode = "401", description = "Pub/Sub push identity is invalid"),
            @ApiResponse(responseCode = "409", description = "Event conflicts with persisted credit state"),
            @ApiResponse(responseCode = "503", description = "Credit persistence is unavailable")
    })
    public ResponseEntity<Void> receiveOpenRefund(@Valid @RequestBody PubSubPushEnvelope envelope) {
        return receive(envelope, properties.openRefundSubscriptionPath(),
                OPEN_REFUND_TYPE, openRefundHandler::handle);
    }

    @PostMapping(COMPLETION_PATH)
    @Operation(summary = "Process an authenticated order-completion event")
    @ApiResponses({
            @ApiResponse(responseCode = "204", description = "Event committed or replayed idempotently"),
            @ApiResponse(responseCode = "400", description = "Push envelope or Order event is invalid"),
            @ApiResponse(responseCode = "401", description = "Pub/Sub push identity is invalid"),
            @ApiResponse(responseCode = "409", description = "Event conflicts with persisted credit state"),
            @ApiResponse(responseCode = "503", description = "Credit persistence is unavailable")
    })
    public ResponseEntity<Void> receiveCompletion(@Valid @RequestBody PubSubPushEnvelope envelope) {
        return receive(envelope, properties.completionSubscriptionPath(),
                COMPLETION_TYPE, completionHandler::handle);
    }

    private ResponseEntity<Void> receive(PubSubPushEnvelope envelope,
                                         String expectedSubscription,
                                         String expectedEventType,
                                         Consumer<OrderEventMessage> handler) {
        OrderEventMessage message = null;
        try {
            message = decoder.decode(envelope.subscription(), decode(envelope.message().data()),
                    envelope.message().attributes(),
                    expectedSubscription, expectedEventType);
            logEvent("order_event_received", envelope.subscription(), message, "received");
            handler.accept(message);
            logEvent("order_event_processed", envelope.subscription(), message,
                    "acknowledgement_ready");
            return ResponseEntity.noContent().build();
        } catch (RuntimeException exception) {
            log.atWarn()
                    .addKeyValue("service", "credit-service")
                    .addKeyValue("subscription", envelope.subscription())
                    .addKeyValue("eventId", message == null ? null : message.eventId())
                    .addKeyValue("eventType", message == null ? expectedEventType : message.eventType())
                    .addKeyValue("orderId", message == null ? null : message.orderId())
                    .addKeyValue("outcome", "failed")
                    .addKeyValue("errorType", exception.getClass().getSimpleName())
                    .addKeyValue("errorMessage", exception.getMessage())
                    .log("order_event_processing_failed");
            throw exception;
        }
    }

    private static String decode(String encoded) {
        try {
            return new String(Base64.getDecoder().decode(encoded), StandardCharsets.UTF_8);
        } catch (IllegalArgumentException exception) {
            throw new InvalidOrderEventException("Pub/Sub message data is not valid Base64.");
        }
    }

    private static void logEvent(String logMessage, String subscription,
                                 OrderEventMessage message, String outcome) {
        log.atInfo()
                .addKeyValue("service", "credit-service")
                .addKeyValue("subscription", subscription)
                .addKeyValue("eventId", message.eventId())
                .addKeyValue("eventType", message.eventType())
                .addKeyValue("orderId", message.orderId())
                .addKeyValue("outcome", outcome)
                .log(logMessage);
    }
}
