/*
 * AI Assistance Disclosure:
 * Tool: OpenAI Codex (GPT-5), date: 2026-10-27
 * Mode: Code generation and implementation assistance.
 * Scope: Generated the Credit compensation workflow implementation from the approved cross-service contract.
 * Author review: I reviewed for correctness
 */
package sg.edu.nus.foc.credit.api;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import jakarta.validation.Valid;
import java.nio.charset.StandardCharsets;
import java.util.Base64;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;
import sg.edu.nus.foc.credit.config.CreditPushProperties;
import sg.edu.nus.foc.credit.error.InvalidCompensationEventException;
import sg.edu.nus.foc.credit.messaging.CreditCompensationPayloadDecoder;
import sg.edu.nus.foc.credit.messaging.CreditCompensationRequest;
import sg.edu.nus.foc.credit.messaging.CreditCompensationService;

@RestController
public class CreditCompensationController {

    public static final String PUSH_PATH = "/api/credits/internal/command-compensations";

    private final CreditCompensationPayloadDecoder decoder;
    private final CreditCompensationService service;
    private final CreditPushProperties properties;

    public CreditCompensationController(CreditCompensationPayloadDecoder decoder,
                                        CreditCompensationService service,
                                        CreditPushProperties properties) {
        this.decoder = decoder;
        this.service = service;
        this.properties = properties;
    }

    @PostMapping(PUSH_PATH)
    @Operation(summary = "Process an authenticated Credit command compensation request")
    @ApiResponses({
            @ApiResponse(responseCode = "204", description = "Compensation committed or replayed idempotently"),
            @ApiResponse(responseCode = "400", description = "Push envelope or compensation request is invalid"),
            @ApiResponse(responseCode = "401", description = "Pub/Sub push identity is invalid"),
            @ApiResponse(responseCode = "409", description = "Event identifier conflicts with saved content"),
            @ApiResponse(responseCode = "503", description = "Credit persistence is unavailable")
    })
    public ResponseEntity<Void> receive(@Valid @RequestBody PubSubPushEnvelope envelope) {
        CreditCompensationRequest request = decoder.decode(envelope.subscription(),
                decode(envelope.message().data()), envelope.message().attributes(),
                properties.compensationSubscriptionPath());
        service.process(request);
        return ResponseEntity.noContent().build();
    }

    private static String decode(String encoded) {
        try {
            return new String(Base64.getDecoder().decode(encoded), StandardCharsets.UTF_8);
        } catch (IllegalArgumentException exception) {
            throw new InvalidCompensationEventException("Pub/Sub message data is not valid Base64.");
        }
    }
}
