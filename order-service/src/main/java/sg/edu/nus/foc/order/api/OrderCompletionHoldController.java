package sg.edu.nus.foc.order.api;

import java.security.Principal;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;
import sg.edu.nus.foc.order.api.dto.request.PlaceCompletionHoldRequest;
import sg.edu.nus.foc.order.api.dto.response.ActiveReportHoldResponse;
import sg.edu.nus.foc.order.api.dto.response.OrderPageResponse;
import sg.edu.nus.foc.order.api.mapper.OrderMapper;
import sg.edu.nus.foc.order.application.OrderCompletionHoldService;
import sg.edu.nus.foc.order.application.OrderQueryService;
import sg.edu.nus.foc.order.domain.OrderProblem;
import sg.edu.nus.foc.order.security.annotation.RequireOrderRole;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.beans.factory.annotation.Value;

@RestController
@RequestMapping("/api/orders/mine/active")
@RequiredArgsConstructor
@RequireOrderRole
@SecurityRequirement(name = "bearerAuth")
@Tag(name = "Order report holds", description = "Caller-scoped active Orders and atomic report hold placement")
public class OrderCompletionHoldController {
    private final OrderCompletionHoldService holds;
    private final OrderQueryService queries;
    private final OrderMapper mapper;
    @Value("${order.reports.creation.enabled:false}")
    private boolean reportCreationEnabled;

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

    @PutMapping("/{orderId}/report-holds/{reportId}")
    @Operation(summary = "Atomically validate a participant's reportable order and place its report hold", description = "reporterRole defaults to REQUESTER; COURIER requires the current assigned courier; PARTICIPANT accepts either actual participant with the matching verified role. Identity comes only from the token. ACCEPTED, IN_PROGRESS, PICKED_UP or DELIVERED only; unrelated, OPEN and terminal orders return404. Locks the role-scoped Order and commits its report hold atomically. The hold stays bound to the real requester. Retries return the current snapshot; released IDs cannot reactivate holds.")
    @ApiResponse(responseCode = "200", description = "Hold committed or existing active hold reused; current snapshot returned")
    @ApiResponse(responseCode = "400", description = "Invalid report ID or missing requireAssignedCourier flag")
    @ApiResponse(responseCode = "401", description = "Authentication required")
    @ApiResponse(responseCode = "403", description = "Matching requester or courier role required")
    @ApiResponse(responseCode = "404", description = "Missing, unowned or inactive Order; indistinguishable response")
    @ApiResponse(responseCode = "409", description = "Required courier missing, report binding conflict, released hold, unresolved command or row contention")
    @ApiResponse(responseCode = "503", description = "Role dependency unavailable")
    public ActiveReportHoldResponse place(@PathVariable String orderId, @PathVariable String reportId,
            @Valid @RequestBody PlaceCompletionHoldRequest request, Principal principal,
            @RequestHeader(value = "Authorization", required = false) String authorization) {
        if (!reportCreationEnabled) {
            throw new OrderProblem("SERVICE_UNAVAILABLE", "Durable report creation is not enabled.");
        }
        requireRole(request.getReporterRole());
        return mapper.toActiveHoldResponse(!"REQUESTER".equals(request.getReporterRole())
                ? holds.placeActive(orderId,reportId,request.getSubmissionId(),caller(principal),request.getRequireAssignedCourier(),authorization,request.getReporterRole())
                : holds.placeActive(orderId,reportId,request.getSubmissionId(),caller(principal),request.getRequireAssignedCourier(),authorization,"REQUESTER"), reportId);
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
