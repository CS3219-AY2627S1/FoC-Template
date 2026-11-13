/*
 * AI Assistance Disclosure:
 * Tool: OpenAI Codex (GPT-5), dates: 2026-10-14 and 2026-10-27
 * Mode: Code generation and testing assistance.
 * Scope: Generated the admin-only Credit transaction and selected-user balance endpoints from
 * user-approved API contracts.
 * Author review: I reviewed for correctness.
 */
package sg.edu.nus.foc.credit.api;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.Size;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import sg.edu.nus.foc.credit.credit.CreditService;

@RestController
@Validated
@RequestMapping("/api/credits")
@PreAuthorize("hasRole('ADMIN')")
@Tag(name = "Credit administration",
        description = "Administrator access to credit balances and transaction history")
public class AdminCreditController {

    private final CreditService service;

    public AdminCreditController(CreditService service) {
        this.service = service;
    }

    @GetMapping("/users/{userId}/balance")
    @Operation(summary = "Get a selected user's current credit balances")
    @ApiResponses({
            @ApiResponse(responseCode = "200", description = "Selected user's current credit balances"),
            @ApiResponse(responseCode = "400", description = "User ID is invalid"),
            @ApiResponse(responseCode = "401", description = "Firebase ID token is missing or invalid"),
            @ApiResponse(responseCode = "403", description = "Caller lacks the administrator role"),
            @ApiResponse(responseCode = "404", description = "Credit account has not been provisioned"),
            @ApiResponse(responseCode = "503", description = "User Service role lookup is unavailable")
    })
    public BalanceResponse userBalance(
            @Parameter(description = "Selected user's opaque Firebase UID")
            @PathVariable @Size(min = 1, max = 128) String userId) {
        return BalanceResponse.from(service.getAccount(userId));
    }

    @GetMapping("/users/{userId}/transactions")
    @Operation(summary = "List a selected user's credit transactions, newest first")
    @ApiResponses({
            @ApiResponse(responseCode = "200", description = "Paginated credit transaction history"),
            @ApiResponse(responseCode = "400", description = "User ID or pagination parameters are invalid"),
            @ApiResponse(responseCode = "401", description = "Firebase ID token is missing or invalid"),
            @ApiResponse(responseCode = "403", description = "Caller lacks the administrator role"),
            @ApiResponse(responseCode = "404", description = "Credit account has not been provisioned"),
            @ApiResponse(responseCode = "503", description = "User Service role lookup is unavailable")
    })
    public TransactionPageResponse userTransactions(
            @Parameter(description = "Selected user's opaque Firebase UID")
            @PathVariable @Size(min = 1, max = 128) String userId,
            @Parameter(description = "One-based page number")
            @RequestParam(defaultValue = "1") @Min(1) int page,
            @Parameter(description = "Transactions per page, from 1 to 100")
            @RequestParam(defaultValue = "20") @Min(1) @Max(100) int size) {
        return TransactionPageResponse.from(service.getTransactions(userId, page, size));
    }

    @GetMapping("/all/transactions")
    @Operation(summary = "List all user-visible credit transactions in the system, newest first")
    @ApiResponses({
            @ApiResponse(responseCode = "200", description = "Paginated system-wide credit transaction history"),
            @ApiResponse(responseCode = "400", description = "Pagination parameters are invalid"),
            @ApiResponse(responseCode = "401", description = "Firebase ID token is missing or invalid"),
            @ApiResponse(responseCode = "403", description = "Caller lacks the administrator role"),
            @ApiResponse(responseCode = "503", description = "User Service role lookup is unavailable")
    })
    public AdminTransactionPageResponse allTransactions(
            @Parameter(description = "One-based page number")
            @RequestParam(defaultValue = "1") @Min(1) int page,
            @Parameter(description = "Transactions per page, from 1 to 100")
            @RequestParam(defaultValue = "20") @Min(1) @Max(100) int size) {
        return AdminTransactionPageResponse.from(service.getAllTransactions(page, size));
    }
}
