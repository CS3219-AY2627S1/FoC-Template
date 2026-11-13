/*
 * AI Assistance Disclosure:
 * Tool: OpenAI Codex (GPT-5), date: 2026-10-27
 * Mode: Code generation and implementation assistance.
 * Scope: Generated the Credit compensation workflow implementation from the approved cross-service contract.
 * Author review: I reviewed for correctness
 */
package sg.edu.nus.foc.credit.api;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import jakarta.validation.constraints.Size;
import java.time.Instant;
import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import sg.edu.nus.foc.credit.messaging.CreditCompensationOutboxDispatcher;
import sg.edu.nus.foc.credit.persistence.CreditCompensationOutboxStore;

@RestController
@Validated
@RequestMapping("/api/credits/admin/compensation-results")
@PreAuthorize("hasRole('ADMIN')")
public class CreditCompensationAdminController {

    private final CreditCompensationOutboxStore outbox;
    private final CreditCompensationOutboxDispatcher dispatcher;

    public CreditCompensationAdminController(CreditCompensationOutboxStore outbox,
                                             CreditCompensationOutboxDispatcher dispatcher) {
        this.outbox = outbox;
        this.dispatcher = dispatcher;
    }

    @PostMapping("/{eventId}/redrive")
    @Operation(summary = "Redrive a retained failed Credit compensation result")
    @ApiResponses({
            @ApiResponse(responseCode = "202", description = "The same result event was queued for redelivery"),
            @ApiResponse(responseCode = "401", description = "Firebase ID token is missing or invalid"),
            @ApiResponse(responseCode = "403", description = "Caller lacks the administrator role"),
            @ApiResponse(responseCode = "404", description = "Result outbox event was not found"),
            @ApiResponse(responseCode = "409", description = "Result outbox event is not FAILED")
    })
    public ResponseEntity<Map<String, String>> redrive(
            @Parameter(description = "Stable compensation result event ID")
            @PathVariable @Size(min = 36, max = 36) String eventId) {
        outbox.redrive(eventId, Instant.now());
        dispatcher.dispatch(eventId);
        return ResponseEntity.status(HttpStatus.ACCEPTED)
                .body(Map.of("eventId", eventId, "status", "PENDING"));
    }
}
