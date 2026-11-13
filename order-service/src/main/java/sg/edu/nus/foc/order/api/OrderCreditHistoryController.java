/* AI assistance: OpenAI Codex, 2026-10-30. Report credit context and response reminders; human review pending. */
package sg.edu.nus.foc.order.api;

import java.security.Principal;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import sg.edu.nus.foc.order.api.dto.response.OrderPageResponse;
import sg.edu.nus.foc.order.api.dto.response.OrderResponse;
import sg.edu.nus.foc.order.api.mapper.OrderMapper;
import sg.edu.nus.foc.order.application.OrderQueryService;
import sg.edu.nus.foc.order.domain.OrderProblem;
import sg.edu.nus.foc.order.security.annotation.RequireOrderRole;

@RestController
@RequestMapping("/api/orders/mine")
@RequiredArgsConstructor
@RequireOrderRole
@SecurityRequirement(name = "bearerAuth")
public class OrderCreditHistoryController {
    private final OrderQueryService queries;
    private final OrderMapper mapper;

    @GetMapping("/completed")
    @Operation(summary = "List completed orders involving the authenticated caller",
            description = "SQL status and requester/current courier ownership filtering before pagination; newest first. Does not place a hold or alter funding.")
    @ApiResponse(responseCode = "200", description = "One-based completed Order page")
    @ApiResponse(responseCode = "400", description = "Page must be >=1 and size 1..100")
    @ApiResponse(responseCode = "401", description = "Authentication required")
    @ApiResponse(responseCode = "403", description = "A recognized Order role is required")
    public OrderPageResponse list(Principal principal,
            @Parameter(description = "One-based page") @RequestParam(defaultValue = "1") int page,
            @Parameter(description = "Page size, 1..100") @RequestParam(defaultValue = "20") int size) {
        return mapper.toResponse(queries.completedInvolving(caller(principal), page, size));
    }

    @GetMapping("/completed/{orderId}")
    @Operation(summary = "View a completed order involving the authenticated caller",
            description = "Requester or assigned courier only; missing, non-completed and unrelated orders all return 404. Read-only context validation; no hold.")
    @ApiResponse(responseCode = "200", description = "Caller-owned completed Order")
    @ApiResponse(responseCode = "401", description = "Authentication required")
    @ApiResponse(responseCode = "403", description = "A recognized Order role is required")
    @ApiResponse(responseCode = "404", description = "Completed order unavailable to this caller")
    public OrderResponse detail(@PathVariable String orderId, Principal principal) {
        return mapper.toResponse(queries.completedInvolving(orderId, caller(principal)));
    }

    @GetMapping("/cancelled")
    @Operation(summary = "List cancelled orders involving the authenticated caller",
            description = "SQL status and requester/current courier ownership filtering before pagination; newest first. Read-only Order history, not a Credit ledger query.")
    @ApiResponse(responseCode = "200", description = "One-based cancelled Order page")
    @ApiResponse(responseCode = "400", description = "Page must be >=1 and size 1..100")
    @ApiResponse(responseCode = "401", description = "Authentication required")
    @ApiResponse(responseCode = "403", description = "A recognized Order role is required")
    public OrderPageResponse cancelled(Principal principal,
            @Parameter(description = "One-based page") @RequestParam(defaultValue = "1") int page,
            @Parameter(description = "Page size, 1..100") @RequestParam(defaultValue = "20") int size) {
        return mapper.toResponse(queries.cancelledInvolving(caller(principal), page, size));
    }

    @GetMapping("/cancelled/{orderId}")
    @Operation(summary = "View a cancelled order involving the authenticated caller",
            description = "Missing, non-cancelled and unrelated orders all return 404. Does not create a report or change credits.")
    @ApiResponse(responseCode = "200", description = "Caller-scoped cancelled Order")
    @ApiResponse(responseCode = "401", description = "Authentication required")
    @ApiResponse(responseCode = "403", description = "A recognized Order role is required")
    @ApiResponse(responseCode = "404", description = "Cancelled order unavailable to this caller")
    public OrderResponse cancelledDetail(@PathVariable String orderId, Principal principal) {
        return mapper.toResponse(queries.cancelledInvolving(orderId, caller(principal)));
    }

    private String caller(Principal principal) {
        if (principal == null || principal.getName() == null || principal.getName().isBlank()) {
            throw new OrderProblem("UNAUTHENTICATED", "Authentication is required.");
        }
        return principal.getName();
    }
}
