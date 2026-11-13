package sg.edu.nus.foc.order.api;

import java.security.Principal;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;
import sg.edu.nus.foc.order.api.dto.response.OrderPageResponse;
import sg.edu.nus.foc.order.api.mapper.OrderMapper;
import sg.edu.nus.foc.order.application.OrderQueryService;
import sg.edu.nus.foc.order.domain.OrderProblem;
import sg.edu.nus.foc.order.security.annotation.RequireOrderRole;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;

@RestController
@RequestMapping("/api/orders/mine/active")
@RequiredArgsConstructor
@RequireOrderRole
@SecurityRequirement(name = "bearerAuth")
@Tag(name = "Order report holds", description = "Caller-scoped reportable Order queries; hold placement is Reporting-authenticated and internal")
public class OrderCompletionHoldController {
    private final OrderQueryService queries;
    private final OrderMapper mapper;

    @GetMapping
    @Operation(summary = "List the authenticated participant's reportable orders", description = "mode=requester (default) lists owned Orders; mode=courier lists currently assigned errands; mode=participant lists both without duplicates. The matching verified role is required. SQL filters ownership/status before pagination: ACCEPTED, IN_PROGRESS, PICKED_UP and DELIVERED only; OPEN and terminal orders are excluded. Caller comes only from the validated token.")
    @ApiResponse(responseCode = "200", description = "One-based active Order page")
    @ApiResponse(responseCode = "400", description = "Invalid page or size; page >=1 and size 1..100")
    @ApiResponse(responseCode = "401", description = "Authentication required")
    @ApiResponse(responseCode = "403", description = "Matching requester or courier role required")
    @ApiResponse(responseCode = "503", description = "Role dependency unavailable")
    public OrderPageResponse active(Principal principal,
            @Parameter(description = "requester, courier or participant; defaults to requester") @RequestParam(defaultValue = "requester") String mode,
            @Parameter(description = "One-based page") @RequestParam(defaultValue = "1") int page,
            @Parameter(description = "Page size, 1..100") @RequestParam(defaultValue = "20") int size) {
        if (!"requester".equals(mode) && !"courier".equals(mode) && !"participant".equals(mode)) {
            throw new OrderProblem("VALIDATION_ERROR", "Mode must be requester, courier or participant.");
        }
        if ("participant".equals(mode)) {
            requireRole("PARTICIPANT");
            return mapper.toResponse(queries.participantActive(caller(principal), page, size));
        }
        requireRole("courier".equals(mode) ? "COURIER" : "REQUESTER");
        return mapper.toResponse("courier".equals(mode) ? queries.assignedActiveTo(caller(principal), page, size)
                : queries.requestedActiveBy(caller(principal), page, size));
    }

    private void requireRole(String role) {
        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
        if (authentication == null || !authentication.isAuthenticated()) {
            throw new OrderProblem("UNAUTHENTICATED", "Authentication is required.");
        }
        if (authentication.getAuthorities().stream().noneMatch(authority -> ("ROLE_" + role).equals(authority.getAuthority())
                || ("PARTICIPANT".equals(role) && ("ROLE_REQUESTER".equals(authority.getAuthority()) || "ROLE_COURIER".equals(authority.getAuthority()))))) {
            throw OrderProblem.forbidden("The selected reporting mode requires the matching user role.");
        }
    }

    private String caller(Principal principal) {
        if (principal == null || principal.getName() == null || principal.getName().isBlank()) {
            throw new OrderProblem("UNAUTHENTICATED", "Authentication is required.");
        }
        return principal.getName();
    }
}
