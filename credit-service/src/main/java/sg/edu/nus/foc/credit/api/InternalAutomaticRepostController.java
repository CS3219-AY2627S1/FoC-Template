package sg.edu.nus.foc.credit.api;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import jakarta.validation.Valid;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import sg.edu.nus.foc.credit.credit.CommandMutationResult;
import sg.edu.nus.foc.credit.credit.CreditCommandService;
import sg.edu.nus.foc.credit.credit.ReservationResult;

/** Narrow keyed reservation only. No unkeyed financial bypass and no user token storage. */
@RestController
@ConditionalOnProperty(name = "FOC_INTERNAL_ORDER_API_ENABLED", havingValue = "true")
public class InternalAutomaticRepostController {
    private final CreditCommandService commands;
    private final sg.edu.nus.foc.credit.credit.CreditService credits;

    public InternalAutomaticRepostController(CreditCommandService commands, sg.edu.nus.foc.credit.credit.CreditService credits) {
        this.commands = commands;
        this.credits = credits;
    }

    @GetMapping("/api/credits/internal/automatic-reposts/{orderId}/funding-ready")
    @Operation(summary = "Check whether an expired original reservation was refunded",
            description = "Private network only. Read-only barrier before registering automatic repost; refund delivery lag must not cause a premature insufficient-funds rejection.")
    @ApiResponse(responseCode = "200", description = "True only for the requester's confirmed REFUNDED reservation")
    @ApiResponse(responseCode = "400", description = "Invalid identifiers")
    @ApiResponse(responseCode = "404", description = "Original reservation missing or not owned by this requester")
    public boolean fundingReady(@PathVariable String orderId, @RequestParam String requesterId) {
        return credits.getReservation(orderId, requesterId).status() == sg.edu.nus.foc.credit.credit.ReservationStatus.REFUNDED;
    }

    @PutMapping("/api/credits/internal/automatic-reposts/{orderId}/reservation")
    @Operation(summary = "Reserve credits for an Order-owned automatic repost",
            description = "Private service network only, no Firebase JWT. Requires immutable command key and positive generation. Reuses the ordinary durable reservation and compensation tombstones.")
    @ApiResponse(responseCode = "200", description = "Applied or replayed; Idempotency-Key and Command-Outcome headers")
    @ApiResponse(responseCode = "400", description = "Invalid input or command headers")
    @ApiResponse(responseCode = "404", description = "Requester credit account missing")
    @ApiResponse(responseCode = "409", description = "Insufficient credits, conflicting binding, stale or compensated command")
    public ResponseEntity<Void> reserve(
            @Parameter(description = "Stable new candidate Order ID") @PathVariable String orderId,
            @RequestHeader(value = "Idempotency-Key", required = false) String key,
            @RequestHeader(value = "X-Command-Generation", required = false) String generationHeader,
            @Valid @RequestBody ReserveCreditsRequest input) {
        long generation;
        try {
            generation = Long.parseLong(generationHeader);
        } catch (NumberFormatException invalid) {
            throw new sg.edu.nus.foc.credit.error.InvalidCommandHeaderException(
                    "X-Command-Generation", "must be a positive whole number");
        }
        CommandMutationResult<ReservationResult> result = commands.reserve(
                key, generation, orderId, input.requesterId(), input.amount());
        return ResponseEntity.ok().header("Idempotency-Key", result.command().commandId())
                .header("Command-Outcome", result.command().outcome().name()).build();
    }
}
