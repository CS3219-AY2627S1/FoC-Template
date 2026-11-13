/*
 * AI Assistance Disclosure:
 * Tool: OpenAI Codex (GPT-5), date: 2026-09-25
 * Mode: Code generation.
 * Scope: Generated the initial HTTP API, validation, ownership enforcement, response mapping, or API types from the team-finalized interface contract.
 * Author review: I reviewed for correctness and edited where needed.
 */
package sg.edu.nus.foc.credit.api;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.headers.Header;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Size;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import java.util.Optional;
import org.springframework.http.HttpStatus;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import sg.edu.nus.foc.credit.credit.CreditReservation;
import sg.edu.nus.foc.credit.credit.CommandMutationResult;
import sg.edu.nus.foc.credit.credit.CreditCommandOutcome;
import sg.edu.nus.foc.credit.credit.CreditCommandResult;
import sg.edu.nus.foc.credit.credit.CreditCommandService;
import sg.edu.nus.foc.credit.credit.CreditService;
import sg.edu.nus.foc.credit.credit.ReservationResult;
import sg.edu.nus.foc.credit.error.ForbiddenException;
import sg.edu.nus.foc.credit.error.InvalidCommandHeaderException;

@RestController
@Validated
@RequestMapping("/api/credits")
@Tag(name = "Credits", description = "Closed-economy credit accounts and order reservations")
public class CreditController {

    private final CreditService service;
    private final CreditCommandService commands;

    public CreditController(CreditService service, CreditCommandService commands) {
        this.service = service;
        this.commands = commands;
    }

    @GetMapping("/me")
    @Operation(summary = "Get current credit balances for the authenticated user")
    @ApiResponses({
            @ApiResponse(responseCode = "200", description = "Current credit balances"),
            @ApiResponse(responseCode = "401", description = "Firebase ID token is missing or invalid"),
            @ApiResponse(responseCode = "404", description = "Credit account has not been provisioned")
    })
    public BalanceResponse balance(JwtAuthenticationToken caller) {
        return BalanceResponse.from(service.getAccount(caller.getName()));
    }

    @GetMapping("/me/transactions")
    @Operation(summary = "List the authenticated user's credit transactions, newest first")
    @ApiResponses({
            @ApiResponse(responseCode = "200", description = "Paginated credit transaction history"),
            @ApiResponse(responseCode = "400", description = "Pagination parameters are invalid"),
            @ApiResponse(responseCode = "401", description = "Firebase ID token is missing or invalid"),
            @ApiResponse(responseCode = "404", description = "Credit account has not been provisioned")
    })
    public TransactionPageResponse transactions(
            @Parameter(description = "One-based page number")
            @RequestParam(defaultValue = "1") @Min(1) int page,
            @Parameter(description = "Transactions per page, from 1 to 100")
            @RequestParam(defaultValue = "20") @Min(1) @Max(100) int size,
            JwtAuthenticationToken caller) {
        return TransactionPageResponse.from(service.getTransactions(caller.getName(), page, size));
    }

    @PutMapping("/orders/{orderId}/reservation")
    @Operation(summary = "Reserve a requester's usable credits for an order")
    @ApiResponses({
            @ApiResponse(responseCode = "201", description = "Credits reserved",
                    headers = {
                            @Header(name = "Idempotency-Key", description = "Recovery command key, when used"),
                            @Header(name = "Command-Outcome", description = "Durable command outcome, when used")
                    }),
            @ApiResponse(responseCode = "200", description = "Existing identical reservation returned",
                    headers = {
                            @Header(name = "Idempotency-Key", description = "Recovery command key, when used"),
                            @Header(name = "Command-Outcome", description = "Durable command outcome, when used")
                    })
    })
    public ResponseEntity<ReservationResponse> reserve(
            @Parameter(description = "Opaque Order Service order ID")
            @PathVariable @Size(max = 128) String orderId,
            @Valid @RequestBody ReserveCreditsRequest request,
            @Parameter(description = "Opaque key for one logical action; must accompany X-Command-Generation")
            @RequestHeader(name = "Idempotency-Key", required = false) String idempotencyKey,
            @Parameter(description = "Positive monotonic claim generation; must accompany Idempotency-Key")
            @RequestHeader(name = "X-Command-Generation", required = false) String generation,
            JwtAuthenticationToken caller) {
        requireSelf(request.requesterId(), caller);
        Optional<RecoveryRequest> recovery = recovery(idempotencyKey, generation);
        if (recovery.isPresent()) {
            requireAuthority(caller, "ROLE_REQUESTER");
            RecoveryRequest command = recovery.get();
            CommandMutationResult<ReservationResult> result = commands.reserve(
                    command.key(), command.generation(), orderId, request.requesterId(), request.amount());
            HttpStatus status = result.replayed() ? HttpStatus.OK : HttpStatus.CREATED;
            return ResponseEntity.status(status)
                    .headers(commandHeaders(result.command()))
                    .body(ReservationResponse.from(
                            result.value().reservation(), result.value().account()));
        }
        ReservationResult result = service.reserve(orderId, request.requesterId(), request.amount());
        HttpStatus status = result.created() ? HttpStatus.CREATED : HttpStatus.OK;
        return ResponseEntity.status(status)
                .body(ReservationResponse.from(result.reservation(), result.account()));
    }

    @GetMapping("/orders/{orderId}/reservation")
    @Operation(summary = "Recover the authenticated requester's reservation status for an order")
    @ApiResponse(responseCode = "200", description = "Reservation status")
    public ReservationResponse reservation(
            @Parameter(description = "Opaque Order Service order ID")
            @PathVariable @Size(max = 128) String orderId,
            JwtAuthenticationToken caller) {
        CreditReservation reservation = service.getReservation(orderId, caller.getName());
        return ReservationResponse.from(reservation);
    }

    @PutMapping("/orders/{orderId}/courier-assignment")
    @PreAuthorize("hasRole('COURIER')")
    @Operation(summary = "Assign the authenticated courier to an active order reservation")
    @ApiResponses({
            @ApiResponse(responseCode = "200", description = "Courier assignment recorded or replayed",
                    headers = {
                            @Header(name = "Idempotency-Key", description = "Recovery command key, when used"),
                            @Header(name = "Command-Outcome", description = "Durable command outcome, when used")
                    }),
            @ApiResponse(responseCode = "403",
                    description = "Caller lacks the courier role or identity does not match"),
            @ApiResponse(responseCode = "404", description = "Reservation or courier credit account not found"),
            @ApiResponse(responseCode = "409", description = "Reservation is inactive or assigned elsewhere"),
            @ApiResponse(responseCode = "503", description = "User Service role lookup is unavailable")
    })
    public ResponseEntity<Void> assignCourier(
            @Parameter(description = "Opaque Order Service order ID")
            @PathVariable @Size(max = 128) String orderId,
            @Valid @RequestBody CourierAssignmentRequest request,
            @Parameter(description = "Opaque key for one logical action; must accompany X-Command-Generation")
            @RequestHeader(name = "Idempotency-Key", required = false) String idempotencyKey,
            @Parameter(description = "Positive monotonic claim generation; must accompany Idempotency-Key")
            @RequestHeader(name = "X-Command-Generation", required = false) String generation,
            JwtAuthenticationToken caller) {
        requireSelf(request.courierId(), caller);
        Optional<RecoveryRequest> recovery = recovery(idempotencyKey, generation);
        if (recovery.isPresent()) {
            RecoveryRequest command = recovery.get();
            CommandMutationResult<Void> result = commands.assignCourier(
                    command.key(), command.generation(), orderId, request.courierId());
            return ResponseEntity.ok().headers(commandHeaders(result.command())).build();
        }
        service.assignCourier(orderId, request.courierId());
        return ResponseEntity.ok().build();
    }

    @PostMapping("/orders/{orderId}/hold-for-reopen")
    @PreAuthorize("hasRole('COURIER')")
    @Operation(summary = "Clear the assigned courier while retaining reserved credits for reopening")
    @ApiResponses({
            @ApiResponse(responseCode = "200", description = "Reservation held for reopen or already held",
                    headers = {
                            @Header(name = "Idempotency-Key", description = "Recovery command key, when used"),
                            @Header(name = "Command-Outcome", description = "Durable command outcome, when used")
                    }),
            @ApiResponse(responseCode = "403", description = "Caller is not the assigned courier"),
            @ApiResponse(responseCode = "404", description = "Reservation not found"),
            @ApiResponse(responseCode = "409", description = "Reservation is no longer active"),
            @ApiResponse(responseCode = "503", description = "User Service role lookup is unavailable")
    })
    public ResponseEntity<Void> holdForReopen(
            @Parameter(description = "Opaque Order Service order ID")
            @PathVariable @Size(max = 128) String orderId,
            @Parameter(description = "Opaque key for one logical action; must accompany X-Command-Generation")
            @RequestHeader(name = "Idempotency-Key", required = false) String idempotencyKey,
            @Parameter(description = "Positive monotonic claim generation; must accompany Idempotency-Key")
            @RequestHeader(name = "X-Command-Generation", required = false) String generation,
            JwtAuthenticationToken caller) {
        Optional<RecoveryRequest> recovery = recovery(idempotencyKey, generation);
        if (recovery.isPresent()) {
            RecoveryRequest command = recovery.get();
            CommandMutationResult<Void> result = commands.clearCourier(
                    command.key(), command.generation(), orderId, caller.getName());
            return ResponseEntity.ok().headers(commandHeaders(result.command())).build();
        }
        service.holdForReopen(orderId, caller.getName());
        return ResponseEntity.ok().build();
    }

    @GetMapping("/commands/{key}")
    @Operation(summary = "Get the authenticated owner's historical Credit command result")
    @ApiResponses({
            @ApiResponse(responseCode = "200", description = "Terminal command result",
                    headers = {
                            @Header(name = "Idempotency-Key", description = "Recovery command key"),
                            @Header(name = "Command-Outcome", description = "Durable command outcome")
                    }),
            @ApiResponse(responseCode = "202", description = "Committed command is still pending",
                    headers = {
                            @Header(name = "Idempotency-Key", description = "Recovery command key"),
                            @Header(name = "Command-Outcome", description = "PENDING")
                    }),
            @ApiResponse(responseCode = "403", description = "Caller does not own the command"),
            @ApiResponse(responseCode = "404", description = "No committed command exists")
    })
    public ResponseEntity<CommandResultResponse> commandStatus(
            @Parameter(description = "Frontend-generated command idempotency key")
            @PathVariable @Size(max = 128) String key,
            JwtAuthenticationToken caller) {
        CreditCommandResult result = commands.status(key, caller.getName());
        HttpStatus status = result.outcome() == CreditCommandOutcome.PENDING
                ? HttpStatus.ACCEPTED : HttpStatus.OK;
        return ResponseEntity.status(status)
                .headers(commandHeaders(result))
                .body(CommandResultResponse.from(result));
    }

    @PostMapping("/commands/{key}/compensate")
    @Operation(summary = "Conditionally reverse or fence an owned Credit command")
    @ApiResponses({
            @ApiResponse(responseCode = "200", description = "Command reversed or fenced without effect",
                    headers = {
                            @Header(name = "Idempotency-Key", description = "Recovery command key"),
                            @Header(name = "Command-Outcome", description = "COMPENSATED")
                    }),
            @ApiResponse(responseCode = "403", description = "Caller lacks ownership or operation permission"),
            @ApiResponse(responseCode = "404", description = "No committed command exists"),
            @ApiResponse(responseCode = "409", description = "Stale generation or reconciliation required")
    })
    public ResponseEntity<CommandResultResponse> compensate(
            @Parameter(description = "Original command idempotency key")
            @PathVariable @Size(max = 128) String key,
            @Parameter(description = "Original command key; must equal the path key")
            @RequestHeader(name = "Idempotency-Key", required = false) String idempotencyKey,
            @Parameter(description = "Positive monotonic compensation generation")
            @RequestHeader(name = "X-Command-Generation", required = false) String generation,
            JwtAuthenticationToken caller) {
        RecoveryRequest recovery = recovery(idempotencyKey, generation)
                .orElseThrow(() -> new InvalidCommandHeaderException(
                        "Idempotency-Key", "is required together with X-Command-Generation"));
        if (!key.equals(recovery.key())) {
            throw new InvalidCommandHeaderException(
                    "Idempotency-Key", "must match the command key in the request path");
        }
        CreditCommandResult result = commands.compensate(
                key, recovery.generation(), caller.getName(),
                hasAuthority(caller, "ROLE_REQUESTER"), hasAuthority(caller, "ROLE_COURIER"));
        return ResponseEntity.ok()
                .headers(commandHeaders(result))
                .body(CommandResultResponse.from(result));
    }

    private static void requireSelf(String userId, JwtAuthenticationToken caller) {
        if (!caller.getName().equals(userId)) {
            throw new ForbiddenException("The authenticated user does not match the requested credit account.");
        }
    }

    private static Optional<RecoveryRequest> recovery(String key, String generation) {
        if (key == null && generation == null) {
            return Optional.empty();
        }
        if (key == null || generation == null) {
            throw new InvalidCommandHeaderException(
                    key == null ? "Idempotency-Key" : "X-Command-Generation",
                    "must be supplied together with the other recovery header");
        }
        long parsed;
        try {
            parsed = Long.parseLong(generation);
        } catch (NumberFormatException exception) {
            throw new InvalidCommandHeaderException(
                    "X-Command-Generation", "must be a positive whole number");
        }
        if (parsed <= 0) {
            throw new InvalidCommandHeaderException(
                    "X-Command-Generation", "must be a positive whole number");
        }
        if (key.isBlank() || key.length() > 128 || key.contains("/")
                || key.equals(".") || key.equals("..")
                || key.startsWith("__") && key.endsWith("__")) {
            throw new InvalidCommandHeaderException("Idempotency-Key", "is not a valid opaque key");
        }
        return Optional.of(new RecoveryRequest(key, parsed));
    }

    private static HttpHeaders commandHeaders(CreditCommandResult result) {
        HttpHeaders headers = new HttpHeaders();
        headers.set("Idempotency-Key", result.commandId());
        headers.set("Command-Outcome", result.outcome().name());
        return headers;
    }

    private static void requireAuthority(JwtAuthenticationToken caller, String authority) {
        if (!hasAuthority(caller, authority)) {
            throw new ForbiddenException("The caller lacks permission for this Credit operation.");
        }
    }

    private static boolean hasAuthority(JwtAuthenticationToken caller, String authority) {
        return caller.getAuthorities().stream().anyMatch(value -> authority.equals(value.getAuthority()));
    }

    private record RecoveryRequest(String key, long generation) {
    }
}
