package sg.edu.nus.foc.order.api;

import java.security.Principal;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.*;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import sg.edu.nus.foc.order.api.dto.request.PlaceCompletionHoldRequest;
import sg.edu.nus.foc.order.api.dto.response.ActiveReportHoldResponse;
import sg.edu.nus.foc.order.api.mapper.OrderMapper;
import sg.edu.nus.foc.order.application.OrderCompletionHoldService;
import sg.edu.nus.foc.order.domain.OrderProblem;
import sg.edu.nus.foc.order.security.ReportHoldCallerVerifier;
import sg.edu.nus.foc.order.security.annotation.RequireOrderRole;

@RestController
@RequestMapping(InternalReportHoldController.PATH)
@RequiredArgsConstructor
@RequireOrderRole
@SecurityRequirement(name = "bearerAuth")
public class InternalReportHoldController {
    public static final String PATH = "/api/orders/internal/report-holds";
    private final OrderCompletionHoldService holds;
    private final OrderMapper mapper;
    private final ReportHoldCallerVerifier reporting;
    @Value("${order.reports.creation.enabled:false}") private boolean enabled;

    @PutMapping("/{orderId}/{reportId}")
    @Operation(summary = "Place a report hold from authenticated Reporting Service",
            description = "Requires BOTH the participant Firebase Authorization token and Reporting's signed Google ID token in X-Reporting-Service-Authorization. Service identity does not bypass participant role, ownership, active-state, submission binding or idempotency checks. Returns the current six-field Order snapshot. Gateway access is blocked; Reporting calls Order directly.")
    @ApiResponse(responseCode = "200", description = "Hold committed or identical active hold reused")
    @ApiResponse(responseCode = "400", description = "Invalid report ID, submission ID, reporter role or missing requireAssignedCourier")
    @ApiResponse(responseCode = "401", description = "Participant or Reporting Service authentication missing/invalid")
    @ApiResponse(responseCode = "403", description = "Matching requester/courier role required")
    @ApiResponse(responseCode = "404", description = "Missing, unrelated or non-reportable Order")
    @ApiResponse(responseCode = "409", description = "Hold binding, active report, command or row contention conflict")
    @ApiResponse(responseCode = "503", description = "Report creation disabled or identity/role verification unavailable")
    public ActiveReportHoldResponse place(@PathVariable String orderId, @PathVariable String reportId,
            @Valid @RequestBody PlaceCompletionHoldRequest request, Principal principal,
            @RequestHeader(value = "Authorization", required = false) String userAuthorization,
            @Parameter(required = true, description = "Bearer Google ID token of the Reporting runtime service account; local credential only in explicit demo-emulator configuration")
            @RequestHeader(value = ReportHoldCallerVerifier.HEADER, required = false) String serviceAuthorization) {
        if (!enabled) throw new OrderProblem("SERVICE_UNAVAILABLE", "Durable report creation is not enabled.");
        reporting.requireReportingCall(serviceAuthorization);
        var caller = SecurityContextHolder.getContext().getAuthentication();
        if (caller == null || !caller.isAuthenticated() || principal == null || principal.getName() == null || principal.getName().isBlank()) {
            throw new OrderProblem("UNAUTHENTICATED", "Participant authentication is required.");
        }
        String role = request.getReporterRole();
        if (caller.getAuthorities().stream().noneMatch(authority -> ("ROLE_" + role).equals(authority.getAuthority())
                || ("PARTICIPANT".equals(role) && ("ROLE_REQUESTER".equals(authority.getAuthority()) || "ROLE_COURIER".equals(authority.getAuthority()))))) {
            throw OrderProblem.forbidden("The selected reporting mode requires the matching user role.");
        }
        return mapper.toActiveHoldResponse(holds.placeActive(orderId, reportId, request.getSubmissionId(),
                principal.getName(), request.getRequireAssignedCourier(), userAuthorization, role), reportId);
    }
}
